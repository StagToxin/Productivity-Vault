; v1.3: uygulamanın adı "Productivity Vault" -> "Verim Asistani" oldu.
; Windows yeni adı ayrı bir program sanıp yanına kurar; eski kopyayı ve kısayollarını burada kaldırıyoruz.
; VERİLERE DOKUNULMAZ: veriler kimlik (com.productivityvault.app) klasöründe durur ve o değişmedi.
!macro NSIS_HOOK_POSTINSTALL
  ${If} "$INSTDIR" != "$LOCALAPPDATA\Productivity Vault"
    ${If} ${FileExists} "$LOCALAPPDATA\Productivity Vault\*.*"
      Sleep 1500
      RMDir /r /REBOOTOK "$LOCALAPPDATA\Productivity Vault"
    ${EndIf}
  ${EndIf}
  Delete "$SMPROGRAMS\Productivity Vault.lnk"
  Delete "$DESKTOP\Productivity Vault.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Productivity Vault"
!macroend
