<#
.SYNOPSIS
  灵犀 IELTS Android 真机 QA harness（MOBILE-07）。
  一次性完成：adb 检查 -> 单设备确认 -> 后端端口检查 -> adb reverse ->
  注入正确 base URL 构建 debug -> 安装 -> 冷启动。

.DESCRIPTION
   recurring hazard 修复：assembleDebug 若不带 -PLINGXI_BACKEND_BASE_URL，
  APK 会回退到模拟器专用地址 10.0.2.2，真机不可路由（表现为"网络不可用"）。
  真机一律使用 http://127.0.0.1:<port> 并通过 adb reverse 映射。

  安全：本脚本不写入、不打印任何 secret / password / cookie / API key。

.PARAMETER Port
  本机后端端口，默认 3000。

.PARAMETER SkipBuild
  跳过 gradle 构建，仅做 reverse + 安装已有 APK + 启动。

.PARAMETER InstallOnly
  仅构建并安装，不启动 App。

.EXAMPLE
  powershell -File scripts/mobile-device-qa.ps1
#>
[CmdletBinding()]
param(
    [int]$Port = 3000,
    [switch]$SkipBuild,
    [switch]$InstallOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $RepoRoot "apps\android"
$Apk = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
$Package = "com.ielts.app"

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    $m" -ForegroundColor Green }
function Die($m)  { Write-Host "!!  $m" -ForegroundColor Red; exit 1 }

# 1. adb ---------------------------------------------------------------------
Step "检查 adb"
$AdbCandidates = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe"
) | Where-Object { $_ -and (Test-Path $_) }
$Adb = $AdbCandidates | Select-Object -First 1
if (-not $Adb) {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { $Adb = $cmd.Source }
}
if (-not $Adb) { Die "未找到 adb，请安装 platform-tools 或设置 ANDROID_HOME。" }
Ok "adb = $Adb"

# 2. 仅允许一台 device --------------------------------------------------------
Step "确认已连接设备（要求恰好一台 device）"
$lines = & $Adb devices | Where-Object { $_ -match "\bdevice$" -and $_ -notmatch "List of devices" }
$serials = @($lines | ForEach-Object { ($_ -split "\s+")[0] })
if ($serials.Count -eq 0) { Die "没有在线 device（请连接真机并允许 USB 调试）。" }
if ($serials.Count -gt 1) {
    Die ("检测到多台设备 $($serials -join ', ')，请只保留一台，或用 ANDROID_SERIAL 指定。")
}
$Serial = $serials[0]
$model = (& $Adb -s $Serial shell getprop ro.product.model).Trim()
Ok "device = $Serial ($model)"

# 3. 后端端口 ----------------------------------------------------------------
Step "检查本机后端端口 $Port"
$listening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if (-not $listening) { Die "本机端口 $Port 未监听，请先启动后端（npm run dev）。" }
Ok "backend listening on 127.0.0.1:$Port"

# 4. adb reverse -------------------------------------------------------------
Step "建立 adb reverse tcp:$Port"
& $Adb -s $Serial reverse "tcp:$Port" "tcp:$Port" | Out-Null
$rev = & $Adb -s $Serial reverse --list
if ($rev -notmatch "tcp:$Port") { Die "adb reverse 建立失败。" }
Ok "reverse ok"

# 5. 构建（注入真机可用 base URL）--------------------------------------------
if (-not $SkipBuild) {
    Step "构建 debug（base URL = http://127.0.0.1:$Port）"
    if (-not $env:JAVA_HOME) {
        $j = "C:\Users\$env:USERNAME\.jdks"
        $jdk = Get-ChildItem $j -Directory -ErrorAction SilentlyContinue |
            Where-Object { Test-Path (Join-Path $_.FullName "bin\java.exe") } |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($jdk) { $env:JAVA_HOME = $jdk.FullName; Ok "JAVA_HOME = $($jdk.FullName)" }
    }
    Push-Location $AndroidDir
    try {
        & .\gradlew.bat :app:assembleDebug "-PLINGXI_BACKEND_BASE_URL=http://127.0.0.1:$Port"
        if ($LASTEXITCODE -ne 0) { Die "assembleDebug 失败 (exit $LASTEXITCODE)。" }
    } finally { Pop-Location }
    Ok "assembleDebug succeeded"
} else {
    Ok "SkipBuild：跳过 gradle 构建"
}

if (-not (Test-Path $Apk)) { Die "APK 不存在：$Apk（去掉 -SkipBuild 先构建）。" }

# 6. 安装 --------------------------------------------------------------------
Step "安装 debug APK（-r）"
& $Adb -s $Serial install -r $Apk | ForEach-Object {
    if ($_ -match "Success") { Ok "install success" } elseif ($_ -match "Failure|Error") { Die "安装失败：$_" }
}

# 7. 启动 --------------------------------------------------------------------
if (-not $InstallOnly) {
    Step "冷启动 $Package"
    & $Adb -s $Serial logcat -c
    & $Adb -s $Serial shell am start -n "$Package/.MainActivity" | Out-Null
    Ok "launched"
}

Write-Host ""
Write-Host "DONE  device=$Serial model=$model baseUrl=http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host "提示：截图 adb exec-out screencap -p > <name>.png；抓崩溃 adb logcat -d | Select-String 'FATAL|AndroidRuntime'" -ForegroundColor DarkGray
