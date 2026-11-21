Param([switch]$Verify)

$ErrorActionPreference = 'Stop'
$serverPath = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $serverPath '.env'

function Read-Credential([string]$Prompt, [string]$Pattern) {
    $entered = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($entered)
    try {
        $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
        if ($value -cnotmatch $Pattern) { throw 'The credential format is invalid.' }
        return $value
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $entered.Dispose()
    }
}

if (-not $Verify) {
    $clientSecret = Read-Credential 'New LWA Client Secret' '^amzn1\.oa2-cs\.[A-Za-z0-9._-]+$'
    $refreshToken = Read-Credential 'New Modern-Depo seller Refresh Token' '^Atzr\|[A-Za-z0-9_.=+/\-]+$'
    $lines = @()
    if (Test-Path -LiteralPath $envPath) {
        $lines = @(Get-Content -LiteralPath $envPath | Where-Object {
            $_ -notmatch '^\s*(?:export\s+)?FITMENT_AMAZON_(?:CLIENT_SECRET|SELLER_REFRESH_TOKEN)\s*='
        })
    }
    $lines += "FITMENT_AMAZON_CLIENT_SECRET=$clientSecret", "FITMENT_AMAZON_SELLER_REFRESH_TOKEN=$refreshToken"
    [IO.File]::WriteAllLines($envPath, [string[]]$lines, [Text.UTF8Encoding]::new($false))
    Write-Host 'Amazon credentials saved to the backend .env. Restart the backend to activate them.'
    return
}

$verifySource = @'
const { amazonFitmentFetcher } = require('./dist/report/sku-fitment-amazon');
const url = 'https://www.amazon.com/dp/B0CQBSD5L2';
const lookup = amazonFitmentFetcher([url], () => { throw new Error('Amazon SP-API credentials are incomplete'); });
lookup(url).then(({ page }) => {
  if (page.title) console.log(page.title);
  if (page.price) console.log(`${page.currency} ${page.price} | ${page.priceSource} | ${page.priceFetchedAt}`);
  else { console.error(page.priceReason || page.reason || 'No verified offer returned'); process.exitCode = 1; }
}).catch(() => { console.error('Could not verify Amazon SP-API. Check backend configuration and build.'); process.exitCode = 1; });
'@

Push-Location -LiteralPath $serverPath
try {
    if (-not (Test-Path -LiteralPath 'dist/report/sku-fitment-amazon.js')) {
        throw 'Run npm run build in the server directory before verifying.'
    }
    $verifySource | node -r dotenv/config -
    if ($LASTEXITCODE -ne 0) { throw 'Amazon SP-API verification did not return a confirmed price.' }
} finally {
    Pop-Location
}
