
bool _Jvhidcontrollerclass_TJvHidDevice_ReadFile_qqrpvuirui
               (int param_1,LPVOID param_2,DWORD param_3,LPDWORD param_4)

{
  char cVar1;
  BOOL BVar2;
  bool bVar3;
  
                    /* 0xccfcc  3160  @Jvhidcontrollerclass@TJvHidDevice@ReadFile$qqrpvuirui */
  bVar3 = false;
  cVar1 = _Jvhidcontrollerclass_TJvHidDevice_OpenFile_qqrv(param_1);
  if (cVar1 != '\0') {
    BVar2 = ReadFile(*(HANDLE *)(param_1 + 0xc),param_2,param_3,param_4,(LPOVERLAPPED)0x0);
    bVar3 = BVar2 != 0;
  }
  return bVar3;
}

