#Requires -Modules ExchangeOnlineManagement, Microsoft.Graph.Users

<#
.SYNOPSIS
    Syncs Exchange Online custom attributes from SIS CSV exports and mirrors
    the Entra account enabled state into CustomAttribute15.

.DESCRIPTION
    This script does NOT enable or disable Entra accounts — that is owned
    exclusively by the Tech-V2 provisioning service. Its sole responsibilities are:
      1. Set Exchange CustomAttribute fields from SIS CSV data (staff and students).
      2. Mirror each account's Entra accountEnabled state into CustomAttribute15:
           - Disabled account  → CustomAttribute15 = today's date stamp
           - Enabled account   → CustomAttribute15 = "" (cleared)

.PARAMETER TenantId
    Azure AD tenant ID. Defaults to the OCBOE production tenant.

.PARAMETER ClientId
    App registration client ID used for both Graph and Exchange Online connections.

.PARAMETER CertThumb
    Certificate thumbprint installed in the local machine cert store for app-only auth.

.PARAMETER Organization
    Primary domain used for Exchange Online app-only auth (e.g. "ocboe.com").

.PARAMETER StaffCsvPath
    UNC or local path to the Synergy staff CSV export.

.PARAMETER StudentCsvPath
    UNC or local path to the Synergy students CSV export.

.PARAMETER DryRun
    When set, logs what would be changed without writing to Exchange Online.

.EXAMPLE
    .\UpdateCustomExtensionAttributes_v2.ps1 -DryRun
    .\UpdateCustomExtensionAttributes_v2.ps1 -StaffCsvPath "C:\exports\staff.csv"
#>

param(
    [string]$TenantId       = "dc07fba0-299e-4d1d-9b0b-8146ff8ce170",
    [string]$ClientId       = "3103cbfc-76b6-456e-9174-720697515386",
    [string]$CertThumb      = "DA8BA59B4382FF2D4A31299D7401CB33CC91D34A",
    [string]$Organization   = "ocboe.com",
    [string]$StaffCsvPath   = "\\10.0.10.83\homes\edupoint\staff.csv",
    [string]$StudentCsvPath = "\\10.0.10.83\homes\edupoint\students.csv",
    [switch]$DryRun
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

$LogFile = "C:\Logs\UpdateCustomExtensionAttributes.log"

function WriteLog {
    param ([string]$Message)
    $line = "$(Get-Date -Format 'yyyy/MM/dd HH:mm:ss') $Message"
    Add-Content $LogFile -Value $line
    Write-Host $line
}

# Archive log if it exceeds 1 GB
if (Test-Path $LogFile) {
    if ((Get-Item $LogFile).Length -gt 1GB) {
        $archive = $LogFile -replace '\.log$', "_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
        Rename-Item $LogFile $archive
        WriteLog "Previous log archived to $archive"
    }
}

if ($DryRun) { WriteLog "=== DRY RUN MODE — no changes will be written ===" }

$disableDate = Get-Date -Format "MM/d/yyyy h:mm:ss tt"

# ---------------------------------------------------------------------------
# Connect — Microsoft Graph (certificate, app-only)
# ---------------------------------------------------------------------------

try {
    Connect-MgGraph `
        -TenantId              $TenantId `
        -ClientId              $ClientId `
        -CertificateThumbprint $CertThumb `
        -NoWelcome `
        -ErrorAction Stop
    WriteLog "Connected to Microsoft Graph"
} catch {
    WriteLog "FATAL: Microsoft Graph connection failed — $($_.Exception.Message)"
    exit 1
}

# ---------------------------------------------------------------------------
# Connect — Exchange Online (certificate, app-only)
# ---------------------------------------------------------------------------

try {
    Connect-ExchangeOnline `
        -AppId                 $ClientId `
        -CertificateThumbprint $CertThumb `
        -Organization          $Organization `
        -ShowBanner:$false `
        -ErrorAction Stop
    WriteLog "Connected to Exchange Online"
} catch {
    WriteLog "FATAL: Exchange Online connection failed — $($_.Exception.Message)"
    Disconnect-MgGraph -ErrorAction SilentlyContinue
    exit 1
}

# ---------------------------------------------------------------------------
# STAFF
# ---------------------------------------------------------------------------
#
# CustomAttribute1  = "Staff"
# CustomAttribute10 = StaffType (from CSV)
# CustomAttribute15 = disable date stamp if accountEnabled=false; "" if enabled

WriteLog "START STAFF"

if (-not (Test-Path $StaffCsvPath)) {
    WriteLog "Staff CSV not found at '$StaffCsvPath' — skipping staff pass"
} else {
    $sisStaffUsers = Import-Csv $StaffCsvPath
    WriteLog "Loaded $($sisStaffUsers.Count) staff records from CSV"

    try {
        $azureStaffUsers = Get-MgUser `
            -Filter           "endsWith(mail,'@ocboe.com')" `
            -ConsistencyLevel eventual `
            -All `
            -Property         "id,userPrincipalName,employeeId,displayName,accountEnabled" `
            -ErrorAction Stop
        WriteLog "Retrieved $($azureStaffUsers.Count) staff accounts from Entra"
    } catch {
        WriteLog "ERROR retrieving staff accounts from Graph — $($_.Exception.Message)"
        $azureStaffUsers = @()
    }

    # Pass 1 — Update Exchange attributes for accounts present in the CSV
    $updateStaffUsers = $azureStaffUsers | Where-Object {
        $sisStaffUsers.BadgeNumber -contains $_.EmployeeId
    }
    WriteLog "Staff accounts matched to CSV: $($updateStaffUsers.Count)"

    foreach ($user in $updateStaffUsers) {
        $sisUser = $sisStaffUsers | Where-Object { $_.BadgeNumber -eq $user.EmployeeId }
        try {
            $typeName  = $sisUser.StaffType.GetType().Name
            $staffType = if ($typeName -eq "Object[]") { $sisUser.StaffType[0] } else { $sisUser.StaffType }

            if ($typeName -eq "Object[]") {
                WriteLog "$($user.UserPrincipalName): multiple StaffType entries ($($sisUser.StaffType -join ', ')), using first: $staffType"
            }

            if ($DryRun) {
                WriteLog "[DRY RUN] Would set CustomAttribute1='Staff' CustomAttribute10='$staffType' for $($user.UserPrincipalName)"
            } else {
                Set-Mailbox -Identity $user.UserPrincipalName `
                    -CustomAttribute1  "Staff" `
                    -CustomAttribute10 $staffType `
                    -ErrorAction Stop
                WriteLog "Updated staff attributes for $($user.UserPrincipalName) (StaffType=$staffType)"
            }
        } catch {
            WriteLog "ERROR updating staff attributes for $($user.UserPrincipalName): $($_.Exception.Message)"
        }
    }

    # Pass 2 — Mirror CustomAttribute15 for ALL staff accounts based on Entra accountEnabled
    foreach ($user in $azureStaffUsers) {
        $stamp = if ($user.AccountEnabled -eq $false) { $disableDate } else { "" }
        try {
            if ($DryRun) {
                $label = if ($user.AccountEnabled -eq $false) { "disabled — stamping date" } else { "enabled — clearing" }
                WriteLog "[DRY RUN] Would set CustomAttribute15='$stamp' for $($user.UserPrincipalName) ($label)"
            } else {
                Set-Mailbox -Identity $user.UserPrincipalName -CustomAttribute15 $stamp -ErrorAction Stop
                WriteLog "Set CustomAttribute15='$stamp' for $($user.UserPrincipalName)"
            }
        } catch {
            WriteLog "ERROR setting CustomAttribute15 for $($user.UserPrincipalName): $($_.Exception.Message)"
        }
    }
}

WriteLog "END STAFF"

# ---------------------------------------------------------------------------
# STUDENTS
# ---------------------------------------------------------------------------
#
# CustomAttribute1  = "Student"
# CustomAttribute2  = Grade
# CustomAttribute3  = Active/Inactive
# CustomAttribute4  = School (OfficeLocation)
# CustomAttribute5  = ELL/ESL
# CustomAttribute14 = Middle Name
# CustomAttribute15 = disable date stamp if accountEnabled=false; "" if enabled

WriteLog "START STUDENT"

if (-not (Test-Path $StudentCsvPath)) {
    WriteLog "Student CSV not found at '$StudentCsvPath' — skipping student pass"
} else {
    $sisStudentUsers = Import-Csv $StudentCsvPath
    # Prefix student IDs to match the format stored in Entra EmployeeId
    $sisStudentUsers | ForEach-Object { $_."Student ID" = "s" + $_."Student ID" }
    WriteLog "Loaded $($sisStudentUsers.Count) student records from CSV"

    try {
        $azureStudentUsers = Get-MgUser `
            -Filter           "endsWith(mail,'@students.ocboe.com')" `
            -ConsistencyLevel eventual `
            -All `
            -Property         "id,userPrincipalName,employeeId,displayName,accountEnabled" `
            -ErrorAction Stop
        WriteLog "Retrieved $($azureStudentUsers.Count) student accounts from Entra"
    } catch {
        WriteLog "ERROR retrieving student accounts from Graph — $($_.Exception.Message)"
        $azureStudentUsers = @()
    }

    # Pass 1 — Update Exchange attributes for accounts present in the CSV
    $updateStudentUsers = $azureStudentUsers | Where-Object {
        $sisStudentUsers."Student ID" -contains $_.EmployeeId
    }
    WriteLog "Student accounts matched to CSV: $($updateStudentUsers.Count)"

    foreach ($user in $updateStudentUsers) {
        $sisUser = $sisStudentUsers | Where-Object { $_."Student ID" -eq $user.EmployeeId }
        try {
            if ($DryRun) {
                WriteLog "[DRY RUN] Would set student attributes for $($user.UserPrincipalName) (Grade=$($sisUser.Grade) School=$($sisUser.School))"
            } else {
                Set-Mailbox -Identity $user.UserPrincipalName `
                    -CustomAttribute1  "Student" `
                    -CustomAttribute2  $sisUser.Grade `
                    -CustomAttribute3  $sisUser.Active `
                    -CustomAttribute4  $sisUser.School `
                    -CustomAttribute5  $sisUser."ELL/ESL" `
                    -CustomAttribute14 $sisUser."Middle Name" `
                    -ErrorAction Stop
                WriteLog "Updated student attributes for $($user.UserPrincipalName) (Grade=$($sisUser.Grade) School=$($sisUser.School))"
            }
        } catch {
            WriteLog "ERROR updating student attributes for $($user.UserPrincipalName): $($_.Exception.Message)"
        }
    }

    # Pass 2 — Mirror CustomAttribute15 for ALL student accounts based on Entra accountEnabled
    foreach ($user in $azureStudentUsers) {
        $stamp = if ($user.AccountEnabled -eq $false) { $disableDate } else { "" }
        try {
            if ($DryRun) {
                $label = if ($user.AccountEnabled -eq $false) { "disabled — stamping date" } else { "enabled — clearing" }
                WriteLog "[DRY RUN] Would set CustomAttribute15='$stamp' for $($user.UserPrincipalName) ($label)"
            } else {
                Set-Mailbox -Identity $user.UserPrincipalName -CustomAttribute15 $stamp -ErrorAction Stop
                WriteLog "Set CustomAttribute15='$stamp' for $($user.UserPrincipalName)"
            }
        } catch {
            WriteLog "ERROR setting CustomAttribute15 for $($user.UserPrincipalName): $($_.Exception.Message)"
        }
    }
}

WriteLog "END STUDENT"

# ---------------------------------------------------------------------------
# Disconnect
# ---------------------------------------------------------------------------

Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
Disconnect-MgGraph -ErrorAction SilentlyContinue
WriteLog "Script complete"
