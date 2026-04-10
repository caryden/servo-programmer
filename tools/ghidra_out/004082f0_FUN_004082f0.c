
int FUN_004082f0(undefined4 param_1,undefined1 *param_2,int param_3)

{
  uint uVar1;
  int iVar2;
  byte local_11;
  undefined1 *local_c;
  
  iVar2 = DAT_007c5231 - 1;
  if (DAT_007c5231 - 1 == 0) {
    uVar1 = _Jvhidcontrollerclass_TJvHidDevice_ReadFile_qqrpvuirui
                      (DAT_007c5184,&DAT_007c526c,0x40,&DAT_007c52ec);
    DAT_007c52f4 = uVar1 & 0xff;
    if (DAT_007c52f4 == 0) {
      iVar2 = 0;
    }
    else if (DAT_007c526d == '\0') {
      iVar2 = 0;
    }
    else if (DAT_007c526e == '\0') {
      local_c = param_2;
      for (local_11 = 0; iVar2 = param_3, (int)(uint)local_11 < param_3; local_11 = local_11 + 1) {
        *local_c = (&DAT_007c5271)[local_11];
        local_c = local_c + 1;
      }
    }
    else {
      iVar2 = 0;
    }
  }
  return iVar2;
}

