<#
  apply-migrations.ps1 — 一键把 Supabase 迁移(0005+0006+0007)跑完
  ------------------------------------------------------------------
  用法（在 IELTS-practice 项目根目录，PowerShell 中执行任一种）：

    # 方式 A：交互式（会提示粘贴 token，输入不回显）
    .\apply-migrations.ps1

    # 方式 B：直接带 token（适合你让我代跑 / CI）
    .\apply-migrations.ps1 -Token "sbp_xxxxxxxxxxxxxxxx"

  说明：
    - 只需 Supabase「Access Token」，不需要数据库密码。
      生成位置：Supabase Dashboard → 左上角项目 → Settings → API → Access Tokens → Generate new token
    - 三个 SQL 都做了幂等（add column if not exists / on conflict do update / drop policy if exists / create table if not exists），可重复执行。
    - 0007 新增 wechat_login_states 表（微信扫码登录中间态），供 /api/auth/wechat-login/* 使用。
    - 项目 ref 默认 nizjfakkmziwanxdcdxd；若变了用 -Ref 覆盖。
#>

param(
  [string]$Ref  = "nizjfakkmziwanxdcdxd",
  [string]$Token = ""
)

if (-not $Token) {
  $Token = Read-Host -Prompt "粘贴你的 Supabase Access Token（sbp_...）"
}
if (-not $Token) {
  Write-Error "未提供 Token，已取消。"
  exit 1
}

$migrationDir = Join-Path $PSScriptRoot "supabase/migrations"
$files = @(
  "0005_account_profile.sql",
  "0006_storage_avatars.sql",
  "0007_wechat_login_states.sql"
)

Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
$js = New-Object System.Web.Script.Serialization.JavaScriptSerializer

$headers = @{
  Authorization = "Bearer $Token"
  "Content-Type" = "application/json"
}

foreach ($file in $files) {
  $path = Join-Path $migrationDir $file
  if (-not (Test-Path $path)) {
    Write-Error "找不到迁移文件：$path"
    exit 1
  }
  $sql = Get-Content -Path $path -Raw -Encoding UTF8
  $body = $js.Serialize(@{ query = $sql })

  Write-Host "→ 执行 $file ..." -ForegroundColor Cyan
  try {
    $resp = Invoke-RestMethod `
      -Uri "https://api.supabase.com/v1/projects/$Ref/database/query" `
      -Method Post `
      -Headers $headers `
      -Body $body `
      -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

    if ($resp -and $resp.error) {
      Write-Host "  ✘ $file 返回错误：$($resp.error.message)" -ForegroundColor Red
      exit 1
    }
    Write-Host "  ✔ $file 执行成功" -ForegroundColor Green
  }
  catch {
    $status = $null
    if ($_.Exception.Response) { $status = $_.Exception.Response.StatusCode.value__ }
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    Write-Host "  ✘ $file 失败 (HTTP $status): $detail" -ForegroundColor Red
    exit 1
  }
}

Write-Host "`n全部迁移完成。现在可以去 /account 上传头像、保存模型/ima 配置，并使用网页端微信扫码登录了。" -ForegroundColor Green
