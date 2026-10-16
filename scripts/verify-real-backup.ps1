param([Parameter(Mandatory = $true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.expo\backups-reais'))
$destination = [IO.Path]::GetFullPath($Directory)
if (-not $destination.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Verificação permitida somente na pasta privada de backups.'
}
if (-not (Test-Path -LiteralPath (Join-Path $destination 'snapshot.pgp'))) { throw 'Cópia criptografada não encontrada.' }
$keyring = Join-Path $destination 'keyring-verificacao'
if (Test-Path -LiteralPath $keyring) { throw 'Pasta temporária já existe; inspecione antes de repetir.' }
New-Item -ItemType Directory -Path $keyring | Out-Null
$gpgHome = '/' + $keyring.Substring(0, 1).ToLowerInvariant() + $keyring.Substring(2).Replace('\', '/')
$secretFile = Join-Path $keyring 'private-import-temporario'
try {
  $protected = [IO.File]::ReadAllBytes((Join-Path $destination 'private-key.dpapi'))
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  try { [IO.File]::WriteAllBytes($secretFile, $bytes) }
  finally { [Array]::Clear($bytes, 0, $bytes.Length) }
  & 'C:\Program Files\Git\usr\bin\gpg.exe' --homedir $gpgHome --batch --import $secretFile 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao abrir a chave protegida.' }
  Remove-Item -LiteralPath $secretFile
  node (Join-Path $PSScriptRoot 'verify-real-backup.mjs') $destination $gpgHome
  if ($LASTEXITCODE -ne 0) { throw 'A verificação local do backup falhou; consulte a etapa informada.' }
} finally {
  & 'C:\Program Files\Git\usr\bin\gpgconf.exe' --homedir $gpgHome --kill gpg-agent 2>$null
  $resolved = [IO.Path]::GetFullPath($keyring)
  if (-not $resolved.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Pasta temporária fora do backup.'
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
