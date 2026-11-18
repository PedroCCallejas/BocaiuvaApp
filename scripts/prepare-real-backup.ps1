param([Parameter(Mandatory = $true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.expo\backups-reais'))
$destination = [IO.Path]::GetFullPath($Directory)
if (-not $destination.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'O backup deve permanecer na pasta privada .expo/backups-reais.'
}
if (Test-Path -LiteralPath $destination) { throw 'Use uma pasta nova para cada backup.' }
$gpg = 'C:\Program Files\Git\usr\bin\gpg.exe'
if (-not (Test-Path -LiteralPath $gpg)) { throw 'GnuPG do Git for Windows não encontrado.' }
New-Item -ItemType Directory -Path $destination | Out-Null
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($sid)
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
Set-Acl -LiteralPath $destination -AclObject $acl
$keyring = Join-Path $destination 'keyring-temporario'
New-Item -ItemType Directory -Path $keyring | Out-Null
$gpgHome = '/' + $keyring.Substring(0, 1).ToLowerInvariant() + $keyring.Substring(2).Replace('\', '/')
& $gpg --homedir $gpgHome --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'Professo FC backup <backup@example.invalid>' rsa3072 cert 1y 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível gerar a chave local de backup.' }
$fingerprintLine = (& $gpg --homedir $gpgHome --batch --with-colons --list-keys 2>$null | Where-Object { $_.StartsWith('fpr:') } | Select-Object -First 1)
$fingerprint = $fingerprintLine.Split(':')[9]
if ($fingerprint -notmatch '^[A-F0-9]{40}$') { throw 'Fingerprint público inválido.' }
& $gpg --homedir $gpgHome --batch --pinentry-mode loopback --passphrase '' --quick-add-key $fingerprint rsa3072 encr 1y 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível gerar a subchave de criptografia.' }
& $gpg --homedir $gpgHome --batch --armor --output (Join-Path $destination 'public-key.asc') --export
if ($LASTEXITCODE -ne 0) { throw 'Falha ao exportar chave pública.' }
$secretFile = Join-Path $keyring 'private-export-temporario'
& $gpg --homedir $gpgHome --batch --output $secretFile --export-secret-keys
if ($LASTEXITCODE -ne 0) { throw 'Falha ao proteger a chave privada.' }
$bytes = [IO.File]::ReadAllBytes($secretFile)
try {
  $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes((Join-Path $destination 'private-key.dpapi'), $protected)
} finally {
  [Array]::Clear($bytes, 0, $bytes.Length)
  Remove-Item -LiteralPath $secretFile
}
& 'C:\Program Files\Git\usr\bin\gpgconf.exe' --homedir $gpgHome --kill gpg-agent 2>$null
$resolvedKeyring = [IO.Path]::GetFullPath($keyring)
if (-not $resolvedKeyring.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Pasta temporária fora do destino autorizado.'
}
Remove-Item -LiteralPath $resolvedKeyring -Recurse -Force
Write-Output 'Chave pública preparada. Chave privada protegida por DPAPI para o usuário Windows atual.'
Write-Output 'Esta cópia exige este perfil Windows; não é ainda uma recuperação independente do computador.'
