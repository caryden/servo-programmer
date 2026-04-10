
undefined4
FUN_00404900(undefined4 param_1,undefined1 param_2,ushort param_3,undefined1 *param_4,ushort param_5
            )

{
  uint uVar1;
  uint uVar2;
  uint uVar3;
  byte local_19;
  undefined1 local_18;
  byte local_14;
  byte local_d;
  
  uVar1 = (uint)param_5;
  uVar3 = (uint)param_3;
  while( true ) {
    if (uVar1 == 0) {
      return 1;
    }
    if (uVar1 < 0x3c) {
      local_14 = (byte)uVar1;
      local_d = local_14;
    }
    else {
      local_d = 0x3b;
    }
    Sleep(0x19);
    DAT_007c52ac = 4;
    DAT_007c52ae = (undefined1)(uVar3 >> 8);
    local_18 = (undefined1)uVar3;
    DAT_007c52af = local_18;
    DAT_007c52b0 = local_d;
    local_19 = 0;
    DAT_007c52ad = param_2;
    if (local_d != 0) {
      do {
        (&DAT_007c52b1)[local_19] = *param_4;
        param_4 = param_4 + 1;
        local_19 = local_19 + 1;
      } while (local_19 < local_d);
    }
    uVar2 = _Jvhidcontrollerclass_TJvHidDevice_WriteFile_qqrpvuirui
                      (DAT_007c5184,&DAT_007c52ac,0x40,&DAT_007c52ec);
    DAT_007c52f4 = uVar2 & 0xff;
    if (DAT_007c52f4 == 0) {
      DAT_007c52f4 = 0;
      return 0;
    }
    uVar2 = _Jvhidcontrollerclass_TJvHidDevice_ReadFile_qqrpvuirui
                      (DAT_007c5184,&DAT_007c526c,0x40,&DAT_007c52ec);
    DAT_007c52f4 = uVar2 & 0xff;
    if (DAT_007c52f4 == 0) {
      return 0;
    }
    if (DAT_007c526d == '\0') break;
    uVar3 = uVar3 + local_d;
    uVar1 = uVar1 - local_d;
  }
  return 0;
}

