#Requires -Modules Microsoft.Graph.Users

<#
.SYNOPSIS
    Reports staff and student Entra accounts that have no employeeId set.

.DESCRIPTION
    The Tech-V2 provisioning service matches SIS records to Entra accounts
    exclusively by employeeId (BadgeNumber for staff, 's'+StudentID for students).
    Any account with a null or empty employeeId is invisible to the matcher and
    will receive a duplicate account on the next live provisioning run.

    This script queries both UPN domains, filters for missing employeeId, and
    writes a CSV report and a console summary.

.PARAMETER TenantId
    Azure AD tenant ID.

.PARAMETER ClientId
    App registration client ID.

.PARAMETER CertThumb
    Certificate thumbprint for app-only auth.

.PARAMETER StaffDomain
    UPN domain for staff accounts (default: ocboe.com).

.PARAMETER StudentDomain
    UPN domain for student accounts (default: students.ocboe.com).

.PARAMETER OutputPath
    Path for the CSV report. Defaults to .\MissingEmployeeId_<timestamp>.csv

.EXAMPLE
    .\Check-MissingEmployeeId.ps1
    .\Check-MissingEmployeeId.ps1 -OutputPath "C:\Reports\missing.csv"
#>

param(
    [string]$TenantId     = "dc07fba0-299e-4d1d-9b0b-8146ff8ce170",
    [string]$ClientId     = "3103cbfc-76b6-456e-9174-720697515386",
    [string]$CertThumb    = "DA8BA59B4382FF2D4A31299D7401CB33CC91D34A",
    [string]$StaffDomain  = "ocboe.com",
    [string]$StudentDomain = "students.ocboe.com",
    [string]$OutputPath   = ".\MissingEmployeeId_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"
)

# ---------------------------------------------------------------------------
# Connect
# ---------------------------------------------------------------------------

try {
    Connect-MgGraph `
        -TenantId              $TenantId `
        -ClientId              $ClientId `
        -CertificateThumbprint $CertThumb `
        -NoWelcome `
        -ErrorAction Stop
    Write-Host "Connected to Microsoft Graph" -ForegroundColor Green
} catch {
    Write-Error "Connection failed: $($_.Exception.Message)"
    exit 1
}

# ---------------------------------------------------------------------------
# Helper - fetch all users for a domain, return those missing employeeId
# ---------------------------------------------------------------------------

function Get-AccountsMissingEmployeeId {
    param(
        [string]$Domain,
        [string]$UserType
    )

    Write-Host "Querying $UserType accounts (@$Domain)..." -ForegroundColor Cyan

    $users = Get-MgUser `
        -Filter           "endsWith(userPrincipalName,'@$Domain')" `
        -ConsistencyLevel eventual `
        -All `
        -Property         "id,displayName,userPrincipalName,employeeId,accountEnabled,createdDateTime" `
        -ErrorAction Stop

    Write-Host "  Retrieved $($users.Count) total accounts"

    $missing = $users | Where-Object { [string]::IsNullOrWhiteSpace($_.EmployeeId) }

    Write-Host "  Missing employeeId: $($missing.Count)" -ForegroundColor $(if ($missing.Count -gt 0) { 'Yellow' } else { 'Green' })

    return $missing | Select-Object @(
        @{ Name = 'UserType';       Expression = { $UserType } },
        @{ Name = 'DisplayName';    Expression = { $_.DisplayName } },
        @{ Name = 'UPN';            Expression = { $_.UserPrincipalName } },
        @{ Name = 'AccountEnabled'; Expression = { $_.AccountEnabled } },
        @{ Name = 'CreatedDate';    Expression = { $_.CreatedDateTime } },
        @{ Name = 'EmployeeId';     Expression = { if ([string]::IsNullOrWhiteSpace($_.EmployeeId)) { '(null)' } else { $_.EmployeeId } } },
        @{ Name = 'EntraId';        Expression = { $_.Id } }
    )
}

# ---------------------------------------------------------------------------
# Run checks
# ---------------------------------------------------------------------------

$staffMissing   = Get-AccountsMissingEmployeeId -Domain $StaffDomain   -UserType 'STAFF'
$studentMissing = Get-AccountsMissingEmployeeId -Domain $StudentDomain -UserType 'STUDENT'

$allMissing = @($staffMissing) + @($studentMissing)

# ---------------------------------------------------------------------------
# Console summary
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Missing EmployeeId Report" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Staff accounts missing employeeId  : $($staffMissing.Count)"
Write-Host "  Student accounts missing employeeId: $($studentMissing.Count)"
Write-Host "  Total at risk of duplication       : $($allMissing.Count)"
Write-Host ""

if ($allMissing.Count -gt 0) {
    Write-Host "Accounts at risk:" -ForegroundColor Yellow
    $allMissing | Format-Table UserType, DisplayName, UPN, AccountEnabled, CreatedDate -AutoSize

    Write-Host ""
    Write-Host "ACTION REQUIRED:" -ForegroundColor Red
    Write-Host "  Each account above has no employeeId. The provisioning service"
    Write-Host "  will treat these users as new and attempt to create duplicate accounts."
    Write-Host "  Set the employeeId (BadgeNumber for staff; 's'+StudentID for students)"
    Write-Host "  on each account in Entra before running a live provisioning job."
} else {
    Write-Host "All accounts have employeeId set - no duplicate risk detected." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

if ($allMissing.Count -gt 0) {
    $allMissing | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8
    Write-Host ""
    Write-Host "Report saved to: $OutputPath" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# Disconnect
# ---------------------------------------------------------------------------

Disconnect-MgGraph -ErrorAction SilentlyContinue
