
undefined4
FUN_004047d0(undefined4 param_1,undefined1 param_2,ushort param_3,undefined1 *param_4,ushort param_5
            )

{
  byte bVar1;
  uint uVar2;
  uint uVar3;
  uint uVar4;
  uint local_1c;
  undefined1 local_18;
  byte local_14;
  byte local_d;
  
  uVar2 = (uint)param_5;
  uVar4 = (uint)param_3;
  uVar3 = uVar2;
  while( true ) {
    if (uVar2 == 0) {
      return CONCAT31((int3)(uVar3 >> 8),1);
    }
    if (uVar2 < 0x3c) {
      local_14 = (byte)uVar2;
      local_d = local_14;
    }
    else {
      local_d = 0x3b;
    }
    Sleep(0x19);
    DAT_007c52ac = 4;
    DAT_007c52ae = (undefined1)(uVar4 >> 8);
    local_18 = (undefined1)uVar4;
    DAT_007c52af = local_18;
    DAT_007c52b0 = local_d;
    DAT_007c52ad = param_2;
    uVar3 = _Jvhidcontrollerclass_TJvHidDevice_WriteFile_qqrpvuirui
                      (DAT_007c5184,&DAT_007c52ac,0x40,&DAT_007c52ec);
    DAT_007c52f4 = uVar3 & 0xff;
    if (DAT_007c52f4 == 0) {
      DAT_007c52f4 = 0;
      return 0;
    }
    bVar1 = _Jvhidcontrollerclass_TJvHidDevice_ReadFile_qqrpvuirui
                      (DAT_007c5184,&DAT_007c526c,0x40,&DAT_007c52ec);
    DAT_007c52f4 = (uint)bVar1;
    if (DAT_007c52f4 == 0) {
      return 0;
    }
    if ((DAT_007c526d == '\0') || (DAT_007c526e != '\0')) break;
    for (local_1c = 0; local_1c < local_d; local_1c = local_1c + 1) {
      *param_4 = (&DAT_007c5271)[local_1c];
      param_4 = param_4 + 1;
    }
    uVar3 = (uint)local_d;
    uVar4 = uVar4 + uVar3;
    uVar2 = uVar2 - local_d;
  }
  return 0;
}

