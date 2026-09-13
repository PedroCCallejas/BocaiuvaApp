<#
.SYNOPSIS
    Sincroniza as skills customizadas do projeto de .claude/skills para .agents/skills.

.DESCRIPTION
    O Claude Code le .claude/skills. O Google Antigravity le .agents/skills.
    As duas arvores precisam dizer a mesma coisa, e a fonte da verdade e
    .claude/skills.

    A lista de skills e explicita, nao um wildcard. Skill nova so passa a ser
    sincronizada quando alguem a acrescenta em $SkillsCustomizadas. Isso mantem
    fora do caminho as skills do Spec Kit (speckit-*), que pertencem ao Specify
    CLI e sao instaladas por ele.

    O script copia arquivo. Nao apaga nada, nao toca em configuracao local, nao
    le nem escreve segredo, nao publica nada.

.PARAMETER DryRun
    Mostra o que seria copiado, sem escrever.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/sync-agent-skills.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/sync-agent-skills.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Skills customizadas deste projeto. Lista explicita, por decisao:
# copiar .claude/skills inteiro arrastaria as skills do Spec Kit junto.
$SkillsCustomizadas = @(
    'auditoria-segura',
    'correcao-minima',
    'deploy-vercel',
    'revisao-antes-commit',
    'revisao-expo',
    'revisao-firebase'
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Origem   = Join-Path $RepoRoot '.claude\skills'
$Destino  = Join-Path $RepoRoot '.agents\skills'

if (-not (Test-Path -LiteralPath $Origem -PathType Container)) {
    throw "Origem nao encontrada: $Origem"
}

if ($DryRun) {
    Write-Host "MODO DRY-RUN: nada sera escrito." -ForegroundColor Yellow
}

Write-Host "Origem : $Origem"
Write-Host "Destino: $Destino"
Write-Host ""

$copiadas = 0
$emDia    = 0
$ausentes = 0

foreach ($skill in $SkillsCustomizadas) {
    $arquivoOrigem  = Join-Path (Join-Path $Origem $skill) 'SKILL.md'
    $pastaDestino   = Join-Path $Destino $skill
    $arquivoDestino = Join-Path $pastaDestino 'SKILL.md'

    if (-not (Test-Path -LiteralPath $arquivoOrigem -PathType Leaf)) {
        Write-Host ("  AUSENTE   {0} - nao existe em .claude/skills" -f $skill) -ForegroundColor Red
        $ausentes++
        continue
    }

    $hashOrigem = (Get-FileHash -LiteralPath $arquivoOrigem -Algorithm SHA256).Hash
    $hashDestino = $null

    if (Test-Path -LiteralPath $arquivoDestino -PathType Leaf) {
        $hashDestino = (Get-FileHash -LiteralPath $arquivoDestino -Algorithm SHA256).Hash
    }

    if ($hashOrigem -eq $hashDestino) {
        Write-Host ("  EM DIA    {0}" -f $skill) -ForegroundColor DarkGray
        $emDia++
        continue
    }

    if ($DryRun) {
        Write-Host ("  COPIARIA  {0}" -f $skill) -ForegroundColor Yellow
        $copiadas++
        continue
    }

    if (-not (Test-Path -LiteralPath $pastaDestino -PathType Container)) {
        New-Item -ItemType Directory -Path $pastaDestino -Force | Out-Null
    }

    Copy-Item -LiteralPath $arquivoOrigem -Destination $arquivoDestino -Force
    Write-Host ("  ATUALIZADA {0}" -f $skill) -ForegroundColor Green
    $copiadas++
}

# Aviso, nunca remocao: decidir apagar arquivo de outra ferramenta nao e papel
# deste script.
if (Test-Path -LiteralPath $Destino -PathType Container) {
    $noDestino = Get-ChildItem -LiteralPath $Destino -Directory | Select-Object -ExpandProperty Name
    $orfas = $noDestino | Where-Object { $SkillsCustomizadas -notcontains $_ }

    if ($orfas) {
        Write-Host ""
        Write-Host "Em .agents/skills e fora da lista deste script (nada foi removido):" -ForegroundColor Yellow
        foreach ($orfa in $orfas) { Write-Host ("  - {0}" -f $orfa) -ForegroundColor Yellow }
    }
}

Write-Host ""
Write-Host ("Resumo: {0} copiada(s), {1} em dia, {2} ausente(s) na origem." -f $copiadas, $emDia, $ausentes)

if ($ausentes -gt 0) {
    exit 1
}
