
void FUN_00403ffc(int param_1,undefined4 param_2)

{
  char cVar1;
  undefined4 uVar2;
  undefined4 *puVar3;
  undefined2 extraout_var;
  undefined2 extraout_var_00;
  undefined4 *in_FS_OFFSET;
  char local_120 [2];
  char local_11e;
  byte local_ef;
  byte local_ee;
  char acStack_e0 [56];
  int *local_a8;
  int *local_a4;
  int *local_a0;
  int local_9c;
  int local_98;
  int *local_94;
  int local_90;
  int local_8c;
  int *local_88;
  char local_84 [8];
  undefined1 local_7c;
  undefined4 local_78;
  undefined4 local_74;
  undefined4 local_70;
  int local_6c;
  undefined4 local_68;
  undefined2 local_58;
  int local_4c;
  undefined1 local_44 [4];
  undefined1 local_40 [4];
  undefined1 local_3c [4];
  undefined1 local_38 [4];
  undefined4 local_34;
  undefined4 local_30;
  undefined4 local_2c;
  undefined4 local_28;
  undefined1 local_24 [4];
  undefined4 local_20;
  undefined1 local_1c [4];
  undefined4 local_18;
  undefined1 local_14 [4];
  undefined1 local_10 [4];
  undefined1 local_c [4];
  undefined1 local_8 [4];
  
  local_70 = param_2;
  local_6c = param_1;
  FUN_00786a58(&DAT_007a8204);
  local_74 = 0;
  local_78 = 0;
  local_58 = 8;
  FUN_004021f4(local_8);
  local_4c = local_4c + 1;
  local_58 = 0x14;
  if ((DAT_007c5231 == '\0') || (DAT_007a7246 != '\0')) {
    local_a8 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_6c + 0x45c));
    local_58 = 200;
    puVar3 = (undefined4 *)FUN_00791bac(local_44,s_Error_01_Please_check_connect_of_007a7614);
    local_4c = local_4c + 1;
    (**(code **)(*local_a8 + 0x38))(local_a8,*puVar3);
    local_4c = local_4c + -1;
    FUN_00791d48(local_44,2);
  }
  else {
    FUN_004047d0(local_6c,CONCAT31((int3)((uint)local_120 >> 8),0x8a),
                 CONCAT22(extraout_var,(undefined2)local_74),local_120,4);
    if ((local_120[0] == '\x03') && (local_11e == '\x01')) {
      FUN_00791f0c();
      DAT_007c5234 = 0x352;
    }
    else if ((local_120[0] == '\x02') && (local_11e == '\x01')) {
      FUN_00791f0c();
      DAT_007c5234 = 0x2f8;
    }
    else {
      if (local_120[0] != '\x04') {
        local_88 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_6c + 0x45c));
        local_58 = 0x20;
        puVar3 = (undefined4 *)FUN_00791bac(local_c,s_Error_02_Please_check_connect_of_007a7540);
        local_4c = local_4c + 1;
        (**(code **)(*local_88 + 0x38))(local_88,*puVar3);
        local_4c = local_4c + -1;
        FUN_00791d48(local_c,2);
        DAT_007c5234 = 0;
        local_58 = 0x2c;
        FUN_00791bac(local_10,&DAT_007a7569);
        local_4c = local_4c + 1;
        FUN_00791d78(&DAT_007c51ec,local_10);
        local_4c = local_4c + -1;
        FUN_00791d48(local_10,2);
        local_58 = 0x38;
        puVar3 = (undefined4 *)FUN_00791bac(local_14,s_Firmware__007a756a);
        local_4c = local_4c + 1;
        FUN_00752fd8(*(undefined4 *)(local_6c + 0x3a8),*puVar3);
        local_4c = local_4c + -1;
        FUN_00791d48(local_14,2);
        local_58 = 0x44;
        uVar2 = FUN_004021f4(&local_18);
        local_4c = local_4c + 1;
        FUN_00752fa8(*(undefined4 *)(local_6c + 0x3a8),uVar2);
        FUN_00752fd8(*(undefined4 *)(local_6c + 0x3f4),local_18);
        local_4c = local_4c + -1;
        FUN_00791d48(&local_18,2);
        local_58 = 0x50;
        puVar3 = (undefined4 *)FUN_00791bac(local_1c,s_Servo_Name__007a7575);
        local_4c = local_4c + 1;
        FUN_00752fd8(*(undefined4 *)(local_6c + 0x3a0),*puVar3);
        local_4c = local_4c + -1;
        FUN_00791d48(local_1c,2);
        local_58 = 0x5c;
        uVar2 = FUN_004021f4(&local_20);
        local_4c = local_4c + 1;
        FUN_00752fa8(*(undefined4 *)(local_6c + 0x3a0),uVar2);
        FUN_00752fd8(*(undefined4 *)(local_6c + 0x3ec),local_20);
        local_4c = local_4c + -1;
        FUN_00791d48(&local_20,2);
        local_58 = 0x68;
        puVar3 = (undefined4 *)FUN_00791bac(local_24,s_Manufacture__007a7582);
        local_4c = local_4c + 1;
        FUN_00752fd8(*(undefined4 *)(local_6c + 0x3a4),*puVar3);
        local_4c = local_4c + -1;
        FUN_00791d48(local_24,2);
        local_58 = 0x74;
        uVar2 = FUN_004021f4(&local_28);
        local_4c = local_4c + 1;
        FUN_00752fa8(*(undefined4 *)(local_6c + 0x3a4),uVar2);
        FUN_00752fd8(*(undefined4 *)(local_6c + 0x3f0),local_28);
        local_4c = local_4c + -1;
        FUN_00791d48(&local_28,2);
        local_4c = local_4c + -1;
        FUN_00791d48(local_8,2);
        *in_FS_OFFSET = local_68;
        return;
      }
      FUN_00791f0c();
      DAT_007c5234 = 0x357;
    }
    local_78 = 0x5f;
    local_58 = 0x80;
    uVar2 = FUN_004021f4(&local_2c);
    local_4c = local_4c + 1;
    FUN_00792194(s_Firmware__007a7590,local_8,uVar2);
    FUN_00752fd8(*(undefined4 *)(local_6c + 0x3a8),local_2c);
    local_4c = local_4c + -1;
    FUN_00791d48(&local_2c,2);
    Sleep(0x19);
    cVar1 = FUN_004047d0(local_6c,0xcd,CONCAT22(extraout_var_00,(undefined2)local_74),local_120,
                         CONCAT22(extraout_var_00,(undefined2)local_78));
    if (cVar1 == '\0') {
      local_a4 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_6c + 0x45c));
      local_58 = 0xbc;
      puVar3 = (undefined4 *)FUN_00791bac(local_40,s_Error_03_Can_t_read_parameter__007a75f5);
      local_4c = local_4c + 1;
      (**(code **)(*local_a4 + 0x38))(local_a4,*puVar3);
      local_4c = local_4c + -1;
      FUN_00791d48(local_40,2);
      local_4c = local_4c + -1;
      FUN_00791d48(local_8,2);
      *in_FS_OFFSET = local_68;
      return;
    }
    if (DAT_007c5234 == 0x352) {
      local_8c = 0;
      do {
        local_84[local_8c] = acStack_e0[local_8c];
        local_8c = local_8c + 1;
      } while (local_8c < 8);
      local_90 = 0;
      local_58 = 0x14;
      do {
        if (local_84[local_90] == '*') {
          local_84[local_90] = ' ';
        }
        local_90 = local_90 + 1;
      } while (local_90 < 8);
      local_7c = 0;
      FUN_00791f0c();
      FUN_00791d78(&DAT_007c51ec,local_8);
      local_58 = 0x8c;
      uVar2 = FUN_004021f4(&local_30);
      local_4c = local_4c + 1;
      FUN_00792194(s_Servo_Name__007a759e,local_8,uVar2);
      FUN_00752fd8(*(undefined4 *)(local_6c + 0x3a0),local_30);
      local_4c = local_4c + -1;
      FUN_00791d48(&local_30,2);
      FUN_00791f0c();
      local_58 = 0x98;
      uVar2 = FUN_004021f4(&local_34);
      local_4c = local_4c + 1;
      FUN_00792194(s_Manufacture__007a75b4,local_8,uVar2);
      FUN_00752fd8(*(undefined4 *)(local_6c + 0x3a4),local_34);
      local_4c = local_4c + -1;
      FUN_00791d48(&local_34,2);
      if (local_ee < 0x14) {
        _Vg_scene_TvgVisualObject_SetEnabled_qqrxo(*(undefined4 *)(local_6c + 0x4b8),0);
      }
      else if ((local_ee == 0x14) && (local_ef < 5)) {
        _Vg_scene_TvgVisualObject_SetEnabled_qqrxo(*(undefined4 *)(local_6c + 0x4b8),0);
      }
      else {
        _Vg_scene_TvgVisualObject_SetEnabled_qqrxo(*(undefined4 *)(local_6c + 0x4b8),1);
      }
      FUN_00404b28(local_6c,local_120);
      local_94 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_6c + 0x45c));
      local_58 = 0xa4;
      puVar3 = (undefined4 *)FUN_00791bac(local_38,s_Success_read_parameter__007a75c2);
      local_4c = local_4c + 1;
      (**(code **)(*local_94 + 0x38))(local_94,*puVar3);
      local_4c = local_4c + -1;
      FUN_00791d48(local_38,2);
    }
    else if (DAT_007c5234 == 0x357) {
      local_98 = 0;
      do {
        local_84[local_98] = acStack_e0[local_98];
        local_98 = local_98 + 1;
      } while (local_98 < 8);
      local_9c = 0;
      local_58 = 0x14;
      do {
        if (local_84[local_9c] == '*') {
          local_84[local_9c] = ' ';
        }
        local_9c = local_9c + 1;
      } while (local_9c < 8);
      local_7c = 0;
      FUN_00791f0c();
      FUN_00791d78(&DAT_007c51ec,local_8);
      _Vg_scene_TvgVisualObject_SetEnabled_qqrxo(*(undefined4 *)(local_6c + 0x4b8),0);
      FUN_004054a0(local_6c,local_120);
      local_a0 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_6c + 0x45c));
      local_58 = 0xb0;
      puVar3 = (undefined4 *)FUN_00791bac(local_3c,s_Success_read_parameter__007a75dd);
      local_4c = local_4c + 1;
      (**(code **)(*local_a0 + 0x38))(local_a0,*puVar3);
      local_4c = local_4c + -1;
      FUN_00791d48(local_3c,2);
    }
  }
  local_4c = local_4c + -1;
  FUN_00791d48(local_8,2);
  *in_FS_OFFSET = local_68;
  return;
}

