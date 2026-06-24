Import-Module ExchangeOnlineManagement

$Logfile = "C:\Logs\UpdateCustomExtensionAttributes.log"

#delete log file if larger than 1GB
Get-ChildItem $Logfile | Where-Object {$_.Length -gt 1gb} | Foreach-Object { Remove-Item $_ }

function WriteLog
{
    Param ([string]$LogString)
    $Stamp = (Get-Date).toString("yyyy/MM/dd HH:mm:ss")
    $LogMessage = "$Stamp $LogString"
    Add-content $LogFile -value $LogMessage
}

#GLOBAL Variables
$disableDate = Get-Date -Format "MM/d/yyyy h:mm:ss tt"
$emailusername = "techadmin@ocboe.com"
$encrypted = Get-Content c:\admin_password.txt | ConvertTo-SecureString
$credential = New-Object System.Management.Automation.PsCredential($emailusername, $encrypted)

Connect-ExchangeOnline -Credential $credential

Select-MgProfile -Name "beta"
#Connect-MgGraph
Connect-MgGraph -TenantId "dc07fba0-299e-4d1d-9b0b-8146ff8ce170" -ClientId "3103cbfc-76b6-456e-9174-720697515386" -CertificateThumbprint "DA8BA59B4382FF2D4A31299D7401CB33CC91D34A"

#get all users that are Staff from Microsoft Graph API
$azureStaffUsers = Get-MgUser -CountVariable CountVar -Filter "endsWith(mail,'@ocboe.com')" -ConsistencyLevel eventual -All

#staff file doesn't exist then just quit
if(-not(Test-Path -Path \\10.0.10.83\homes\edupoint\staff.csv)){
    WriteLog "The staff file did not exist so exiting"
    exit
}

#get all users from the staff file from synergy
$sisStaffUsers = Import-CSV \\10.0.10.83\homes\edupoint\staff.csv

WriteLog "START STAFF"

#these will be the users left to update
$updateStaffUsers = $azureStaffUsers | Where-Object { ($sisStaffUsers.BadgeNumber -contains $_.EmployeeId) -and ($_.OnPremisesExtensionAttributes.ExtensionAttribute1 -eq 'Staff') }

foreach($updateStaffUser in $updateStaffUsers){
    $sisStaffUser = $sisStaffUsers | Where-Object { $_.BadgeNumber -eq $updateStaffUser.EmployeeId }
    Try{
        Write-Host $sisStaffUser.StaffType
        $typeName = $sisStaffUser.StaffType.GetType().Name

        if ($typeName -eq “String”) { #Single Staff type so set the attributes
            WriteLog "Single instance for staff type with " +_ $sisStaffUsers.StaffType
            Set-Mailbox -Identity $updateStaffUser.UserPrincipalName -CustomAttribute1 "Staff" -CustomAttribute10 $sisStaffUser.StaffType -CustomAttribute15 "null" -ErrorAction Stop
        } elseif ($typeName -eq “Object[]”) { #array of staff types due to multiple buildings assigned so pick the first one
            WriteLog "Multiple instances of user with staff types: " + $sisStaffUsers.StaffType + ". Setting StaffType to first instance of " + $sisStaffUsers.StaffType[0]
            Set-Mailbox -Identity $updateStaffUser.UserPrincipalName -CustomAttribute1 "Staff" -CustomAttribute10 $sisStaffUser.StaffType[0] -CustomAttribute15 "null" -ErrorAction Stop
        } else { 
            Write-Host “Unsupported data type: $typeName” 
        }
        WriteLog "Updated user $($updateStaffUser.UserPrincipalName)"
    }
    Catch{
        WriteLog "Problem updating user $($updateStaffUser.UserPrincipalName)"
        WriteLog $_.Exception.Message
    }
}

#these will be the users left to delete
$deleteStaffUsers = $azureStaffUsers | Where-Object { ($sisStaffUsers.BadgeNumber -notcontains $_.EmployeeId) -and ($_.OnPremisesExtensionAttributes.ExtensionAttribute1 -eq 'Staff') }

$deleteStaffUsers | ForEach-Object {
    WriteLog "Disabling $($_.UserPrincipalName)"
    Write-Host "Disabling $($_.UserPrincipalName)"
    Try{
        Update-MgUser -UserId $_.UserPrincipalName -AccountEnabled:$false
    }
    Catch{
        WriteLog $_.Exception.Message
    }
    Try{
        Set-Mailbox -Identity $_.UserPrincipalName -CustomAttribute15 $disableDate -ErrorAction Stop
    }
    Catch{
        WriteLog $_.Exception.Message
    }
}

WriteLog "END STAFF"
Write-Host "END STAFF"

###########################
#Staff Extension Attributes
###########################
#ExtensionAttribute1 = Staff
#ExtensionAttribute10 = EmployeeType
#ExtensionAttribute15 = DateTime.Now //this is for disable

#get all users that are Students from Microsoft Graph API
$azureStudentUsers = Get-MgUser -CountVariable CountVar -Filter "endsWith(mail,'@students.ocboe.com')" -ConsistencyLevel eventual -All

#student file doesn't exist then just exit
if(-not(Test-Path -Path \\10.0.10.83\homes\edupoint\students.csv)){
    WriteLog "The student file did not exist so exiting"
    exit
}

#get all users from the student file from synergy
$sisStudentUsers = Import-CSV \\10.0.10.83\homes\edupoint\students.csv

WriteLog "START STUDENT"

$sisStudentUsers | ForEach-Object {
    $_."Student ID" = "s" + $_."Student ID"
}


#these will be the users left to update
$updateStudentUsers = $azureStudentUsers | Where-Object { ($sisStudentUsers."Student ID" -contains $_.EmployeeId) -and ($_.OnPremisesExtensionAttributes.ExtensionAttribute1 -eq 'Student') }

foreach($updateStudentUser in $updateStudentUsers){
    $sisStudentUser = $sisStudentUsers | Where-Object { $_."Student ID" -eq $updateStudentUser.EmployeeId }
    Write-Host $sisStudentUser."Student ID"
    Write-Host $updateStudentUser.EmployeeId
    Try{
        Set-Mailbox -Identity $updateStudentUser.UserPrincipalName -CustomAttribute1 'Student' -CustomAttribute14 $sisStudentUser."Middle Name" -CustomAttribute2 $sisStudentUser.Grade -CustomAttribute3 $sisStudentUser.Active -CustomAttribute5 $sisStudentUser."ELL/ESL" -CustomAttribute4 $sisStudentUser.School -CustomAttribute15 "null" -ErrorAction Stop
        WriteLog "Updated user $($updateStudentUser.UserPrincipalName)"
    }
    Catch{
        WriteLog "Problem updating user $($updateStudentUser.UserPrincipalName)"
        WriteLog $_.Exception.Message
    }
}

#these will be the users left to delete
$deleteStudentUsers = $azureStudentUsers | Where-Object { ($sisStudentUsers."Student ID" -notcontains $_.EmployeeId) -and ($_.OnPremisesExtensionAttributes.ExtensionAttribute1 -eq 'Student') -and ($_.OnPremisesExtensionAttributes.ExtensionAttribute15 -eq "null") }

$deleteStudentUsers | ForEach-Object {
    WriteLog "Disabling $($_.UserPrincipalName)"
    Write-Host "Disabling $($_.UserPrincipalName)"
    Try{
        Update-MgUser -UserId $_.UserPrincipalName -AccountEnabled:$false
    }
    Catch{
        WriteLog $_.Exception.Message
    }
    Try{
        Set-Mailbox -Identity $_.UserPrincipalName -CustomAttribute15 $disableDate -ErrorAction Stop
    }
    Catch{
        WriteLog $_.Exception.Message
    }
}

WriteLog "END STUDENT"
Write-Host "END STUDENT"

#############################
#Student Extension Attributes
#############################
#ExtensionAttribute14 = Middle Name
#ExtensionAttribute2 = Grade
#ExtensionAttribute3 = Active/Inactive
#ExtensionAttribute5 = ELL/ESL
#ExtensionAttribute1 = Student
#ExtensionAttribute4 = OfficeLocation
#ExtensionAttribute15 = DateTime.Now //this is for disable