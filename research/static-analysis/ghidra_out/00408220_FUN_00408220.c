
undefined4 FUN_00408220(undefined4 param_1,undefined1 param_2,undefined1 *param_3,int param_4)

{
  uint uVar1;
  byte local_12;
  byte local_11;
  undefined1 *local_10;
  
  if (DAT_007c5231 != '\0') {
    DAT_007c52ac = 4;
    DAT_007c52ad = param_2;
    local_10 = param_3;
    if (param_4 == 5) {
      DAT_007c52ae = 4;
      for (local_11 = 0; local_11 < 4; local_11 = local_11 + 1) {
        local_10 = local_10 + 1;
        (&DAT_007c52af)[local_11] = *local_10;
      }
    }
    else {
      DAT_007c52ae = (undefined1)param_4;
      for (local_12 = 0; (int)(uint)local_12 < param_4; local_12 = local_12 + 1) {
        (&DAT_007c52af)[local_12] = *local_10;
        local_10 = local_10 + 1;
      }
    }
    uVar1 = _Jvhidcontrollerclass_TJvHidDevice_WriteFile_qqrpvuirui
                      (DAT_007c5184,&DAT_007c52ac,0x40,&DAT_007c52ec);
    DAT_007c52f4 = uVar1 & 0xff;
    if (DAT_007c52f4 == 0) {
      param_1 = 0;
    }
    else {
      param_1 = 1;
    }
  }
  return param_1;
}

