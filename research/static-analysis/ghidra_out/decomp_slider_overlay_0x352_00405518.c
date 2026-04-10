
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00405518(int param_1,undefined1 *param_2)

{
  char cVar1;
  undefined1 uVar2;
  undefined4 uVar3;
  int iVar4;
  undefined4 *in_FS_OFFSET;
  undefined4 uVar5;
  undefined4 uVar6;
  undefined1 local_f4;
  undefined4 local_e8;
  undefined1 local_c4 [16];
  undefined1 local_b4 [16];
  undefined1 local_a4 [16];
  undefined1 local_94 [16];
  undefined1 local_84 [16];
  undefined1 local_74 [16];
  undefined1 local_64 [16];
  undefined1 local_54 [16];
  undefined1 local_44 [16];
  undefined1 local_34 [16];
  undefined1 local_24 [16];
  undefined1 local_14 [16];
  
  FUN_00786a58(&DAT_007a848c);
  cVar1 = (**(code **)(**(int **)(param_1 + 0x35c) + 0x120))();
  if (cVar1 == '\0') {
    param_2[0x25] = param_2[0x25] & 0xef;
  }
  else {
    param_2[0x25] = param_2[0x25] | 0x10;
  }
  cVar1 = (**(code **)(**(int **)(param_1 + 0x364) + 0x120))();
  if (cVar1 == '\0') {
    cVar1 = (**(code **)(**(int **)(param_1 + 0x368) + 0x120))();
    if (cVar1 == '\0') {
      param_2[0x25] = param_2[0x25] & 0xf3;
      if (*(int *)(*(int *)(param_1 + 0x354) + 0x220) == 0) {
        param_2[1] = 0xd0;
        *param_2 = 0x3b;
        param_2[3] = 0xf6;
        param_2[2] = 0xb;
      }
      else if (*(int *)(*(int *)(param_1 + 0x354) + 0x220) == 1) {
        param_2[1] = 0x3e;
        *param_2 = 0x32;
        param_2[3] = 0x88;
        param_2[2] = 0x15;
      }
      else if (*(int *)(*(int *)(param_1 + 0x354) + 0x220) == 2) {
        param_2[1] = 0x75;
        *param_2 = 0x2d;
        param_2[3] = 0x51;
        param_2[2] = 0x1a;
      }
      else {
        param_2[1] = 0x75;
        *param_2 = 0x2d;
        param_2[3] = 0x51;
        param_2[2] = 0x1a;
      }
      param_2[4] = *(undefined1 *)(*(int *)(param_1 + 0x358) + 0x220);
      param_2[5] = *(undefined1 *)(*(int *)(param_1 + 0x358) + 0x220);
    }
    else {
      param_2[0x25] = param_2[0x25] | 4;
      param_2[1] = 0x3e;
      *param_2 = 0xb;
      param_2[3] = 0x1c;
      param_2[2] = 3;
      param_2[4] = *(undefined1 *)(*(int *)(param_1 + 0x358) + 0x220);
      param_2[5] = *(undefined1 *)(*(int *)(param_1 + 0x358) + 0x220);
    }
  }
  else {
    param_2[0x25] = param_2[0x25] | 8;
    param_2[1] = 0x1f;
    *param_2 = 0x19;
    param_2[3] = 0xc4;
    param_2[2] = 10;
    param_2[4] = *(undefined1 *)(*(int *)(param_1 + 0x358) + 0x220);
    param_2[5] = *(undefined1 *)(*(int *)(param_1 + 0x358) + 0x220);
  }
  cVar1 = (**(code **)(**(int **)(param_1 + 0x360) + 0x120))();
  if (cVar1 == '\0') {
    if ((param_2[0x25] & 2) == 2) {
      param_2[0x25] = param_2[0x25] & 0xfd;
      if ((param_2[0x25] & 1) == 1) {
        param_2[0x25] = param_2[0x25] & 0xfe;
      }
      else {
        param_2[0x25] = param_2[0x25] | 1;
      }
    }
  }
  else if ((param_2[0x25] & 2) != 2) {
    param_2[0x25] = param_2[0x25] | 2;
    if ((param_2[0x25] & 1) == 1) {
      param_2[0x25] = param_2[0x25] & 0xfe;
    }
    else {
      param_2[0x25] = param_2[0x25] | 1;
    }
  }
  cVar1 = (**(code **)(**(int **)(param_1 + 0x36c) + 0x120))();
  if (cVar1 == '\0') {
    param_2[0x25] = param_2[0x25] & 0x7f;
  }
  else {
    param_2[0x25] = param_2[0x25] | 0x80;
    uVar6 = 0x40590000;
    uVar5 = 0;
    uVar3 = FUN_0079230c(local_14);
    iVar4 = **(int **)(param_1 + 0x388);
    (**(code **)(iVar4 + 0x494))(*(int **)(param_1 + 0x388),uVar3,iVar4,uVar5,uVar6);
    uVar3 = FUN_0079230c(local_24);
    FUN_00406120(local_14,0xff,uVar3);
    uVar3 = FUN_0079230c(local_34);
    FUN_004061b4(local_24,uVar3);
    FUN_0079262c(local_34);
    FUN_007924ac(local_34,2);
    FUN_007924ac(local_24,2);
    FUN_007924ac(local_14,2);
    uVar2 = FUN_0078aed0();
    param_2[0x35] = uVar2;
    uVar3 = FUN_0079230c(local_44);
    (**(code **)(**(int **)(param_1 + 900) + 0x494))(*(int **)(param_1 + 900),uVar3);
    FUN_0079262c(local_44);
    FUN_007924ac(local_44,2);
    uVar2 = FUN_0078aed0();
    param_2[0x36] = uVar2;
    uVar6 = 0x40590000;
    uVar5 = 0;
    uVar3 = FUN_0079230c(local_54);
    iVar4 = **(int **)(param_1 + 0x390);
    (**(code **)(iVar4 + 0x494))(*(int **)(param_1 + 0x390),uVar3,iVar4,uVar5,uVar6);
    uVar3 = FUN_0079230c(local_64);
    FUN_00406120(local_54,0xff,uVar3);
    uVar3 = FUN_0079230c(local_74);
    FUN_004061b4(local_64,uVar3);
    FUN_0079262c(local_74);
    FUN_007924ac(local_74,2);
    FUN_007924ac(local_64,2);
    FUN_007924ac(local_54,2);
    uVar2 = FUN_0078aed0();
    param_2[0x37] = uVar2;
    uVar3 = FUN_0079230c(local_84);
    (**(code **)(**(int **)(param_1 + 0x38c) + 0x494))(*(int **)(param_1 + 0x38c),uVar3);
    FUN_0079262c(local_84);
    FUN_007924ac(local_84,2);
    uVar2 = FUN_0078aed0();
    param_2[0x38] = uVar2;
    uVar6 = 0x40590000;
    uVar5 = 0;
    uVar3 = FUN_0079230c(local_94);
    iVar4 = **(int **)(param_1 + 0x398);
    (**(code **)(iVar4 + 0x494))(*(int **)(param_1 + 0x398),uVar3,iVar4,uVar5,uVar6);
    uVar3 = FUN_0079230c(local_a4);
    FUN_00406120(local_94,0xff,uVar3);
    uVar3 = FUN_0079230c(local_b4);
    FUN_004061b4(local_a4,uVar3);
    FUN_0079262c(local_b4);
    FUN_007924ac(local_b4,2);
    FUN_007924ac(local_a4,2);
    FUN_007924ac(local_94,2);
    uVar2 = FUN_0078aed0();
    param_2[0x39] = uVar2;
    uVar3 = FUN_0079230c(local_c4);
    (**(code **)(**(int **)(param_1 + 0x394) + 0x494))(*(int **)(param_1 + 0x394),uVar3);
    FUN_0079262c(local_c4);
    FUN_007924ac(local_c4,2);
    uVar2 = FUN_0078aed0();
    param_2[0x3a] = uVar2;
  }
  iVar4 = (**(code **)(**(int **)(param_1 + 0x37c) + 200))();
  if (iVar4 == 0) {
    param_2[0x25] = param_2[0x25] & 0x9f;
  }
  else {
    iVar4 = (**(code **)(**(int **)(param_1 + 0x37c) + 200))();
    if (iVar4 == 1) {
      param_2[0x25] = param_2[0x25] & 0xdf;
      param_2[0x25] = param_2[0x25] | 0x40;
    }
    else {
      param_2[0x25] = param_2[0x25] | 0x60;
    }
  }
  param_2[6] = *(char *)(*(int *)(param_1 + 0x380) + 0x220) + -0x80;
  param_2[0xc] = (*(char *)(*(int *)(param_1 + 0x378) + 0x220) + '\x01') * '\x10';
  DAT_007c523c = (uint)(byte)param_2[8] * 0x100 + (uint)(byte)param_2[9];
  DAT_007c5245 = param_2[0x14];
  DAT_007c5248 = (uint)(byte)param_2[0x19] * 0x100 + (uint)(byte)param_2[0x1a];
  DAT_007c5251 = param_2[0x15];
  DAT_007c5254 = (uint)(byte)param_2[0x1b] * 0x100 + (uint)(byte)param_2[0x1c];
  DAT_007c525d = param_2[0x16];
  DAT_007c5260 = (uint)(byte)param_2[0x1d] * 0x100 + (uint)(byte)param_2[0x1e];
  DAT_007c5269 = param_2[0x17];
  DAT_007c5244 = *(undefined1 *)(*(int *)(param_1 + 0x370) + 0x220);
  DAT_007c5250 = *(char *)(*(int *)(param_1 + 0x370) + 0x220);
  DAT_007c525c = *(undefined1 *)(*(int *)(param_1 + 0x370) + 0x220);
  DAT_007c5268 = DAT_007c5250 + -0x14;
  param_2[0x12] = DAT_007c5244;
  param_2[0x13] = DAT_007c5250;
  param_2[0x11] = DAT_007c525c;
  param_2[0xf] = DAT_007c5268;
  uVar3 = *(undefined4 *)(*(int *)(param_1 + 0x374) + 0x220);
  DAT_007c524c = *(undefined4 *)(*(int *)(param_1 + 0x374) + 0x220);
  DAT_007c5258 = *(undefined4 *)(*(int *)(param_1 + 0x374) + 0x220);
  DAT_007c5264 = *(undefined4 *)(*(int *)(param_1 + 0x374) + 0x220);
  local_f4 = (undefined1)uVar3;
  DAT_007c5240 = uVar3;
  param_2[0xb] = local_f4;
  param_2[10] = (char)((uint)uVar3 >> 8);
  uVar3 = DAT_007c524c;
  local_f4 = (undefined1)DAT_007c524c;
  param_2[0x28] = local_f4;
  param_2[0x27] = (char)((uint)uVar3 >> 8);
  uVar3 = DAT_007c5258;
  local_f4 = (undefined1)DAT_007c5258;
  param_2[0x2a] = local_f4;
  param_2[0x29] = (char)((uint)uVar3 >> 8);
  uVar3 = DAT_007c5264;
  local_f4 = (undefined1)DAT_007c5264;
  param_2[0x2c] = local_f4;
  param_2[0x2b] = (char)((uint)uVar3 >> 8);
  *in_FS_OFFSET = local_e8;
  return;
}

