
void FUN_00403060(int param_1,undefined4 param_2)

{
  char cVar1;
  undefined4 *puVar2;
  undefined4 extraout_ECX;
  undefined4 uVar3;
  undefined2 extraout_var;
  undefined2 extraout_var_00;
  undefined2 uVar4;
  undefined2 extraout_var_01;
  undefined4 *in_FS_OFFSET;
  undefined1 local_e4 [120];
  int *local_6c;
  int *local_68;
  int *local_64;
  int *local_60;
  uint local_5c;
  uint local_4c;
  undefined4 local_48;
  undefined4 local_44;
  int local_40;
  undefined4 local_3c;
  undefined2 local_2c;
  int local_20;
  undefined1 local_18 [4];
  undefined1 local_14 [4];
  undefined1 local_10 [4];
  undefined1 local_c [4];
  undefined1 local_8 [4];
  
  local_44 = param_2;
  local_40 = param_1;
  FUN_00786a58(&DAT_007a7e04);
  local_48 = 0;
  local_4c = 0;
  local_2c = 8;
  FUN_004021f4(local_8);
  local_20 = local_20 + 1;
  local_2c = 0x14;
  if (((DAT_007c5231 == '\0') || (DAT_007c5234 == 0)) || (DAT_007a7246 != '\0')) {
    local_6c = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_40 + 0x45c));
    local_2c = 0x44;
    puVar2 = (undefined4 *)FUN_00791bac(local_18,s_Error_05_Please_check_connect_or_007a73dc);
    local_20 = local_20 + 1;
    (**(code **)(*local_6c + 0x38))(local_6c,*puVar2);
    local_20 = local_20 + -1;
    FUN_00791d48(local_18,2);
    local_20 = local_20 + -1;
    FUN_00791d48(local_8,2);
    *in_FS_OFFSET = local_3c;
  }
  else {
    if (DAT_007c5234 == 0x352) {
      local_4c = 0x5f;
    }
    if (DAT_007c5234 == 0x357) {
      local_4c = 0x5f;
    }
    if (DAT_007c5234 == 0x2f8) {
      local_4c = 0x5f;
    }
    cVar1 = FUN_004047d0(local_40,CONCAT31((int3)(CONCAT22(extraout_var_01,(undefined2)local_4c) >>
                                                 8),0xcd),
                         CONCAT22((short)((uint)local_e4 >> 0x10),(undefined2)local_48),local_e4,
                         CONCAT22(extraout_var_01,(undefined2)local_4c));
    if (cVar1 == '\0') {
      local_68 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_40 + 0x45c));
      local_2c = 0x38;
      puVar2 = (undefined4 *)FUN_00791bac(local_14,s_Error_04_Can_t_read_parameter__007a73bd);
      local_20 = local_20 + 1;
      (**(code **)(*local_68 + 0x38))(local_68,*puVar2);
      local_20 = local_20 + -1;
      FUN_00791d48(local_14,2);
      local_20 = local_20 + -1;
      FUN_00791d48(local_8,2);
      *in_FS_OFFSET = local_3c;
    }
    else {
      uVar3 = extraout_ECX;
      for (local_5c = 0; uVar4 = (undefined2)((uint)uVar3 >> 0x10), local_5c < local_4c;
          local_5c = local_5c + 1) {
        uVar3 = CONCAT31((int3)((uint)uVar3 >> 8),local_e4[local_5c]);
        (&DAT_007c5189)[local_5c] = local_e4[local_5c];
      }
      if (DAT_007c5234 == 0x352) {
        FUN_00405518(local_40,&DAT_007c5189);
        uVar4 = extraout_var;
      }
      if (DAT_007c5234 == 0x357) {
        FUN_00406248(local_40,&DAT_007c5189);
        uVar4 = extraout_var_00;
      }
      cVar1 = FUN_00404900(local_40,0xcb,CONCAT22(uVar4,(undefined2)local_48),&DAT_007c5189,
                           CONCAT22(uVar4,(undefined2)local_4c));
      if (cVar1 == '\0') {
        local_64 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_40 + 0x45c));
        local_2c = 0x2c;
        puVar2 = (undefined4 *)FUN_00791bac(local_10,s_Error_06_Can_t_write_parameter__007a739d);
        local_20 = local_20 + 1;
        (**(code **)(*local_64 + 0x38))(local_64,*puVar2);
        local_20 = local_20 + -1;
        FUN_00791d48(local_10,2);
        local_20 = local_20 + -1;
        FUN_00791d48(local_8,2);
        *in_FS_OFFSET = local_3c;
      }
      else {
        local_60 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_40 + 0x45c));
        local_2c = 0x20;
        puVar2 = (undefined4 *)FUN_00791bac(local_c,s_Success_write_parameter__007a7384);
        local_20 = local_20 + 1;
        (**(code **)(*local_60 + 0x38))(local_60,*puVar2);
        local_20 = local_20 + -1;
        FUN_00791d48(local_c,2);
        local_20 = local_20 + -1;
        FUN_00791d48(local_8,2);
        *in_FS_OFFSET = local_3c;
      }
    }
  }
  return;
}

