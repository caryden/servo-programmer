
bool _Jvhidcontrollerclass_TJvHidDevice_WriteFile_qqrpvuirui
               (int param_1,LPCVOID param_2,DWORD param_3,LPDWORD param_4)

{
  char cVar1;
  BOOL BVar2;
  bool bVar3;
  
                    /* 0xcd00c  3161  @Jvhidcontrollerclass@TJvHidDevice@WriteFile$qqrpvuirui */
  bVar3 = false;
  cVar1 = _Jvhidcontrollerclass_TJvHidDevice_OpenFile_qqrv(param_1);
  if (cVar1 != '\0') {
    BVar2 = WriteFile(*(HANDLE *)(param_1 + 0xc),param_2,param_3,param_4,(LPOVERLAPPED)0x0);
    bVar3 = BVar2 != 0;
  }
  return bVar3;
}

