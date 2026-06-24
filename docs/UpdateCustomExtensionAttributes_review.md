# UpdateCustomExtensionAttributes.ps1 — Review & Required Changes

## Intended Scope (updated)

This script's sole responsibility is syncing Exchange Online custom attributes from
SIS CSV exports. It does **not** enable or disable Entra accounts — that is owned
exclusively by Tech-V2's provisioning service, which has threshold guards, audit
logging, batch approval, and test mode.

The script should:
1. Connect to Microsoft Graph (read) and Exchange Online
2. For each staff / student account found in the SIS CSV, set the Exchange
   `CustomAttribute` fields from the CSV values
3. For **every** account (regardless of CSV membership), read `accountEnabled` from
   Graph and mirror it in `CustomAttribute15`:
   - `accountEnabled = false` → set `CustomAttribute15` to today's date (disable stamp)
   - `accountEnabled = true`  → set `CustomAttribute15` to `""` (clear the stamp)
4. Log all changes. No writes to Entra — no `Update-MgUser` calls at all.

### Exchange CustomAttribute mapping

**Staff**

| Attribute | Value |
|---|---|
| CustomAttribute1 | `"Staff"` |
| CustomAttribute10 | `StaffType` from CSV |
| CustomAttribute15 | Date stamp if account disabled in Entra; `""` if enabled |

**Students**

| Attribute | Value |
|---|---|
| CustomAttribute1 | `"Student"` |
| CustomAttribute2 | `Grade` from CSV |
| CustomAttribute3 | `Active` from CSV |
| CustomAttribute4 | `School` from CSV (OfficeLocation) |
| CustomAttribute5 | `ELL/ESL` from CSV |
| CustomAttribute14 | `Middle Name` from CSV |
| CustomAttribute15 | Date stamp if account disabled in Entra; `""` if enabled |

---

## Changes Required

### 1. Remove all account disable logic (CRITICAL — scope correction)

The `$deleteStaffUsers` and `$deleteStudentUsers` blocks must be removed entirely.
This includes every `Update-MgUser -AccountEnabled:$false` call. Tech-V2 owns Entra
account state; this script must not touch it.

**Remove the following blocks:**

```powershell
# REMOVE — staff disable block (lines 68–86)
$deleteStaffUsers = $azureStaffUsers | Where-Object { ... }
$deleteStaffUsers | ForEach-Object {
    Update-MgUser -UserId $_.UserPrincipalName -AccountEnabled:$false
    Set-Mailbox -Identity $_.UserPrincipalName -CustomAttribute15 $disableDate ...
}

# REMOVE — student disable block (lines 134–152)
$deleteStudentUsers = $azureStudentUsers | Where-Object { ... }
$deleteStudentUsers | ForEach-Object {
    Update-MgUser -UserId $_.UserPrincipalName -AccountEnabled:$false
    Set-Mailbox -Identity $_.UserPrincipalName -CustomAttribute15 $disableDate ...
}
```

### 2. Replace CustomAttribute15 logic — mirror Entra state, don't drive it

Instead of setting CustomAttribute15 only when this script decides to disable, it
should reflect the account's actual Entra `accountEnabled` state on every run. This
keeps Exchange in sync even when Tech-V2 re-enables an account.

Add a separate pass after the CSV update loops for each user type:

```powershell
# After updating staff CSV attributes — mirror Entra enabled state
foreach ($user in $azureStaffUsers) {
    $stamp = if ($user.AccountEnabled -eq $false) { $disableDate } else { "" }
    try {
        Set-Mailbox -Identity $user.UserPrincipalName -CustomAttribute15 $stamp -ErrorAction Stop
        WriteLog "Set CustomAttribute15='$stamp' for $($user.UserPrincipalName)"
    } catch {
        WriteLog "Failed to set CustomAttribute15 for $($user.UserPrincipalName): $($_.Exception.Message)"
    }
}
```

Repeat the same pattern for `$azureStudentUsers`.

Note: `Get-MgUser` does not return `AccountEnabled` by default — it must be requested
explicitly:

```powershell
$azureStaffUsers = Get-MgUser `
    -Filter "endsWith(mail,'@ocboe.com')" `
    -ConsistencyLevel eventual `
    -All `
    -Property "id,userPrincipalName,employeeId,displayName,accountEnabled"
```

### 3. `Select-MgProfile -Name "beta"` — removed in SDK v2 (CRITICAL)

This cmdlet was removed in Microsoft Graph PowerShell SDK v2.0.0. It will throw a
command-not-found error and halt the script before any work is done.

**Remove this line entirely.** `Get-MgUser` and `Update-MgUser` are available in the
v1.0 profile without any profile selection.

### 4. `Connect-ExchangeOnline -Credential` — basic auth deprecated (CRITICAL)

Microsoft retired basic authentication for Exchange Online PowerShell in October 2023.
The credential-based connection will fail.

Replace with certificate-based auth (same pattern already used for MgGraph):

```powershell
Connect-ExchangeOnline `
    -AppId                 $ClientId `
    -CertificateThumbprint $CertThumb `
    -Organization          "ocboe.com"
```

This requires the app registration to have the `Exchange.ManageAsApp` API permission
and the Exchange Administrator role assigned in the M365 admin center.

Once this is done, remove the `$emailusername`, `$encrypted`, and `$credential`
variables and the `c:\admin_password.txt` file entirely.

### 5. Broken `WriteLog` calls — lines 52 and 55 (High)

The `+` and `+_` operators are not valid PowerShell string concatenation inside a
function argument. These calls produce errors and no log output.

```powershell
# Broken — line 52
WriteLog "Single instance for staff type with " +_ $sisStaffUsers.StaffType

# Broken — line 55
WriteLog "Multiple instances of user with staff types: " + $sisStaffUsers.StaffType + ...
```

Fix with string interpolation:

```powershell
WriteLog "Single instance for $($sisStaffUser.UserPrincipalName): StaffType=$($sisStaffUser.StaffType)"
WriteLog "Multiple StaffTypes for $($sisStaffUser.UserPrincipalName): $($sisStaffUser.StaffType -join ', '). Using first: $($sisStaffUser.StaffType[0])"
```

### 6. Wrong variable in log messages — lines 52, 55 (High)

Both broken lines reference `$sisStaffUsers` (the full collection) instead of
`$sisStaffUser` (the single matched user). Corrected in the fix above.

### 7. Hardcoded tenant ID, client ID, and certificate thumbprint (Medium)

Move to script parameters so values can be rotated without editing the script:

```powershell
param(
    [string]$TenantId     = $env:GRAPH_TENANT_ID,
    [string]$ClientId     = $env:GRAPH_CLIENT_ID,
    [string]$CertThumb    = $env:GRAPH_CERT_THUMBPRINT,
    [string]$Organization = "ocboe.com",
    [string]$StaffCsvPath   = "\\10.0.10.83\homes\edupoint\staff.csv",
    [string]$StudentCsvPath = "\\10.0.10.83\homes\edupoint\students.csv"
)
```

### 8. Hardcoded UNC IP address (Low)

`\\10.0.10.83\homes\edupoint\` should use a hostname. Absorbed into the parameter
approach in #7 above.

### 9. No connection error handling (Medium)

If either connection fails, the script continues and produces cryptic errors. Wrap
both connect calls:

```powershell
try {
    Connect-MgGraph -TenantId $TenantId -ClientId $ClientId `
        -CertificateThumbprint $CertThumb -NoWelcome -ErrorAction Stop
} catch {
    WriteLog "FATAL: MgGraph connection failed — $($_.Exception.Message)"
    exit 1
}

try {
    Connect-ExchangeOnline -AppId $ClientId `
        -CertificateThumbprint $CertThumb -Organization $Organization `
        -ShowBanner:$false -ErrorAction Stop
} catch {
    WriteLog "FATAL: Exchange Online connection failed — $($_.Exception.Message)"
    exit 1
}
```

### 10. Add a dry-run mode (Low)

Wrap all `Set-Mailbox` calls behind a `$DryRun` switch so the script can be tested
without writing to Exchange:

```powershell
param([switch]$DryRun)

if ($DryRun) {
    WriteLog "[DRY RUN] Would set CustomAttribute10='$($sisStaffUser.StaffType)' for $($user.UserPrincipalName)"
} else {
    Set-Mailbox -Identity $user.UserPrincipalName -CustomAttribute10 $sisStaffUser.StaffType -ErrorAction Stop
}
```

---

## What to keep (no changes needed)

- `WriteLog` function — works correctly
- Log file size guard — minor, acceptable as-is
- Staff match by `EmployeeId` / `BadgeNumber` — correct
- Student ID prefix (`"s" + $_."Student ID"`) — correct
- `Get-MgUser` with `-ConsistencyLevel eventual -All` — correct for large result sets
- The attribute mapping table comments at the bottom — keep and expand

---

## Summary — Priority Order

| # | Issue | Severity |
|---|---|---|
| 1 | Remove all `Update-MgUser` disable calls | Critical — scope violation, conflicts with Tech-V2 |
| 3 | `Select-MgProfile` removed in SDK v2 | Critical — script will not start |
| 4 | Credential-based EXO auth deprecated | Critical — connection will fail |
| 2 | Rework CustomAttribute15 to mirror Entra state | High — core new behaviour |
| 5 | Broken `WriteLog` syntax | High — log entries silently lost |
| 6 | Wrong variable in log messages | High — misleading log output |
| 9 | No connection error handling | Medium — confusing failure mode |
| 7 | Hardcoded IDs / thumbprint | Medium — rotation risk |
| 8 | Hardcoded UNC IP address | Low — hostname preferred |
| 10 | No dry-run mode | Low — operational safety |
