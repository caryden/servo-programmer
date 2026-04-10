
/* WARNING: Removing unreachable block (ram,0x004051c2) */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00404b28(int param_1,byte *param_2)

{
  float fVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 *in_FS_OFFSET;
  undefined4 local_90;
  undefined1 local_6c [16];
  undefined1 local_5c [16];
  undefined1 local_4c [16];
  undefined1 local_3c [16];
  undefined1 local_2c [16];
  undefined1 local_1c [16];
  undefined1 local_c [4];
  undefined1 local_8 [4];
  
  FUN_00786a58(&DAT_007a837c);
  if ((param_2[0x25] & 0x10) == 0x10) {
    (**(code **)(**(int **)(param_1 + 0x35c) + 0x124))(*(int **)(param_1 + 0x35c),1);
  }
  else {
    (**(code **)(**(int **)(param_1 + 0x35c) + 0x124))(*(int **)(param_1 + 0x35c),0);
  }
  if ((param_2[0x25] & 8) == 8) {
    (**(code **)(**(int **)(param_1 + 0x364) + 0x124))(*(int **)(param_1 + 0x364),1);
    FUN_00752ec8(*(undefined4 *)(param_1 + 0x354),0);
    puVar2 = (undefined4 *)FUN_00791bac(local_8,s_PPM_Range__450_1050_us_007a7655);
    FUN_00752fd8(*(undefined4 *)(param_1 + 0x32c),*puVar2);
    FUN_00791d48(local_8,2);
  }
  else if ((param_2[0x25] & 4) == 4) {
    (**(code **)(**(int **)(param_1 + 0x368) + 0x124))(*(int **)(param_1 + 0x368),1);
    FUN_00752ec8(*(undefined4 *)(param_1 + 0x354),0);
    puVar2 = (undefined4 *)FUN_00791bac(local_c,s_PPM_Range__130_470_us_007a766c);
    FUN_00752fd8(*(undefined4 *)(param_1 + 0x32c),*puVar2);
    FUN_00791d48(local_c,2);
  }
  else {
    (**(code **)(**(int **)(param_1 + 0x368) + 0x124))(*(int **)(param_1 + 0x368),0);
    (**(code **)(**(int **)(param_1 + 0x364) + 0x124))(*(int **)(param_1 + 0x364),0);
    FUN_00752ec8(*(undefined4 *)(param_1 + 0x354),0);
    fVar1 = (float)(_DAT_0040541c * (longdouble)((uint)*param_2 * 0x100 + (uint)param_2[1]));
    if (fVar1 <= 2450.0) {
      if (fVar1 <= 2005.0) {
        (**(code **)(**(int **)(param_1 + 0x354) + 0xf8))(*(int **)(param_1 + 0x354),2);
      }
      else {
        (**(code **)(**(int **)(param_1 + 0x354) + 0xf8))(*(int **)(param_1 + 0x354),1);
      }
    }
    else {
      (**(code **)(**(int **)(param_1 + 0x354) + 0xf8))(*(int **)(param_1 + 0x354),0);
    }
  }
  if ((param_2[0x25] & 2) == 2) {
    (**(code **)(**(int **)(param_1 + 0x360) + 0x124))(*(int **)(param_1 + 0x360),1);
  }
  else {
    (**(code **)(**(int **)(param_1 + 0x360) + 0x124))(*(int **)(param_1 + 0x360),0);
  }
  if ((param_2[0x25] & 0x80) == 0x80) {
    (**(code **)(**(int **)(param_1 + 0x36c) + 0x124))(*(int **)(param_1 + 0x36c),1);
    (**(code **)(**(int **)(param_1 + 0x388) + 100))(*(int **)(param_1 + 0x388),1);
    (**(code **)(**(int **)(param_1 + 900) + 100))(*(int **)(param_1 + 900),1);
    (**(code **)(**(int **)(param_1 + 0x390) + 100))(*(int **)(param_1 + 0x390),1);
    (**(code **)(**(int **)(param_1 + 0x38c) + 100))(*(int **)(param_1 + 0x38c),1);
    (**(code **)(**(int **)(param_1 + 0x398) + 100))(*(int **)(param_1 + 0x398),1);
    (**(code **)(**(int **)(param_1 + 0x394) + 100))(*(int **)(param_1 + 0x394),1);
    uVar3 = FUN_00792418(local_1c);
    (**(code **)(**(int **)(param_1 + 0x388) + 0x49c))(*(int **)(param_1 + 0x388),uVar3);
    FUN_007924ac(local_1c,2);
    uVar3 = FUN_00792460(local_2c);
    (**(code **)(**(int **)(param_1 + 900) + 0x49c))(*(int **)(param_1 + 900),uVar3);
    FUN_007924ac(local_2c,2);
    uVar3 = FUN_00792418(local_3c);
    (**(code **)(**(int **)(param_1 + 0x390) + 0x49c))(*(int **)(param_1 + 0x390),uVar3);
    FUN_007924ac(local_3c,2);
    uVar3 = FUN_00792460(local_4c);
    (**(code **)(**(int **)(param_1 + 0x38c) + 0x49c))(*(int **)(param_1 + 0x38c),uVar3);
    FUN_007924ac(local_4c,2);
    uVar3 = FUN_00792418(local_5c);
    (**(code **)(**(int **)(param_1 + 0x398) + 0x49c))(*(int **)(param_1 + 0x398),uVar3);
    FUN_007924ac(local_5c,2);
    uVar3 = FUN_00792460(local_6c);
    (**(code **)(**(int **)(param_1 + 0x394) + 0x49c))(*(int **)(param_1 + 0x394),uVar3);
    FUN_007924ac(local_6c,2);
  }
  else {
    (**(code **)(**(int **)(param_1 + 0x36c) + 0x124))(*(int **)(param_1 + 0x36c),0);
    (**(code **)(**(int **)(param_1 + 0x388) + 100))(*(int **)(param_1 + 0x388),0);
    (**(code **)(**(int **)(param_1 + 900) + 100))(*(int **)(param_1 + 900),0);
    (**(code **)(**(int **)(param_1 + 0x390) + 100))(*(int **)(param_1 + 0x390),0);
    (**(code **)(**(int **)(param_1 + 0x38c) + 100))(*(int **)(param_1 + 0x38c),0);
    (**(code **)(**(int **)(param_1 + 0x398) + 100))(*(int **)(param_1 + 0x398),0);
    (**(code **)(**(int **)(param_1 + 0x394) + 100))(*(int **)(param_1 + 0x394),0);
  }
  if ((param_2[0x25] & 0x40) == 0x40) {
    if ((param_2[0x25] & 0x20) == 0x20) {
      (**(code **)(**(int **)(param_1 + 0x37c) + 0xcc))(*(int **)(param_1 + 0x37c),2);
    }
    else {
      (**(code **)(**(int **)(param_1 + 0x37c) + 0xcc))(*(int **)(param_1 + 0x37c),1);
    }
  }
  else {
    (**(code **)(**(int **)(param_1 + 0x37c) + 0xcc))(*(int **)(param_1 + 0x37c),0);
  }
  (**(code **)(**(int **)(param_1 + 0x358) + 0xf8))(*(int **)(param_1 + 0x358),param_2[4]);
  (**(code **)(**(int **)(param_1 + 0x380) + 0xf8))(*(int **)(param_1 + 0x380),param_2[6] - 0x80);
  if ((uint)((int)(uint)param_2[0xc] >> 4) < 2) {
    (**(code **)(**(int **)(param_1 + 0x378) + 0xf8))(*(int **)(param_1 + 0x378),0);
  }
  else {
    (**(code **)(**(int **)(param_1 + 0x378) + 0xf8))
              (*(int **)(param_1 + 0x378),((int)(uint)param_2[0xc] >> 4) - 1);
  }
  DAT_007c523c = (uint)param_2[8] * 0x100 + (uint)param_2[9];
  DAT_007c5240 = (uint)param_2[10] * 0x100 + (uint)param_2[0xb];
  DAT_007c5244 = param_2[0x12];
  DAT_007c5245 = param_2[0x14];
  DAT_007c5248 = (uint)param_2[0x19] * 0x100 + (uint)param_2[0x1a];
  DAT_007c524c = (uint)param_2[0x27] * 0x100 + (uint)param_2[0x28];
  DAT_007c5250 = param_2[0x13];
  DAT_007c5251 = param_2[0x15];
  DAT_007c5254 = (uint)param_2[0x1b] * 0x100 + (uint)param_2[0x1c];
  DAT_007c5258 = (uint)param_2[0x29] * 0x100 + (uint)param_2[0x2a];
  DAT_007c525c = param_2[0x11];
  DAT_007c525d = param_2[0x16];
  DAT_007c5260 = (uint)param_2[0x1d] * 0x100 + (uint)param_2[0x1e];
  DAT_007c5264 = (uint)param_2[0x2b] * 0x100 + (uint)param_2[0x2c];
  DAT_007c5268 = param_2[0xf];
  DAT_007c5269 = param_2[0x17];
  if ((param_2[0x26] & 0x40) == 0x40) {
    (**(code **)(**(int **)(param_1 + 0x370) + 0xf8))(*(int **)(param_1 + 0x370),DAT_007c5250);
    (**(code **)(**(int **)(param_1 + 0x374) + 0xf8))(*(int **)(param_1 + 0x374),DAT_007c524c);
  }
  else {
    (**(code **)(**(int **)(param_1 + 0x370) + 0xf8))(*(int **)(param_1 + 0x370),DAT_007c5244);
    (**(code **)(**(int **)(param_1 + 0x374) + 0xf8))(*(int **)(param_1 + 0x374),DAT_007c5240);
  }
  *in_FS_OFFSET = local_90;
  return;
}

