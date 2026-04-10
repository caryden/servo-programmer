
void _Jvhidcontrollerclass_TJvHidDevice_GetProductName_qqrv(int param_1,undefined4 param_2)

{
  char cVar1;
  int iVar2;
  bool bVar3;
  undefined1 local_204 [508];
  
                    /* 0xcc1b4  3123  @Jvhidcontrollerclass@TJvHidDevice@GetProductName$qqrv */
  bVar3 = true;
  FUN_00702714(*(undefined4 *)(param_1 + 0x54));
  if (bVar3) {
    cVar1 = _Jvhidcontrollerclass_TJvHidDevice_OpenFile_qqrv(param_1);
    if (cVar1 != '\0') {
      FUN_00700794(local_204,0x1fc,0);
      iVar2 = (**(code **)PTR__Hid_HidD_GetProductString_007c4f64)();
      if (iVar2 != 0) {
        FUN_007025c0(param_1 + 0x54,local_204,0xfe);
      }
      _Jvhidcontrollerclass_TJvHidDevice_CloseFile_qqrv(param_1);
    }
  }
  FUN_0070244c(param_2,*(undefined4 *)(param_1 + 0x54));
  return;
}

