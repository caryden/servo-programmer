
void FUN_00408b90(int param_1,undefined4 param_2)

{
  undefined4 *puVar1;
  undefined4 *in_FS_OFFSET;
  char local_b8 [120];
  int *local_40;
  int *local_3c;
  undefined4 local_38;
  int local_34;
  undefined4 local_30;
  undefined2 local_20;
  int local_14;
  undefined1 local_c [4];
  undefined1 local_8 [4];
  
  local_38 = param_2;
  local_34 = param_1;
  FUN_00786a58(&DAT_007a8d34);
  if ((DAT_007c5231 != '\0') && (DAT_007a7246 == '\0')) {
    FUN_004047d0(local_34,CONCAT31((int3)((uint)local_b8 >> 8),0x5a),0,local_b8,1);
    if (local_b8[0] == -0x56) {
      local_3c = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_34 + 0x45c));
      local_20 = 8;
      puVar1 = (undefined4 *)FUN_00791bac(local_8,s_Success_to_default__007a79ee);
      local_14 = local_14 + 1;
      (**(code **)(*local_3c + 0x38))(local_3c,*puVar1);
      local_14 = local_14 + -1;
      FUN_00791d48(local_8,2);
    }
    else {
      local_40 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_34 + 0x45c));
      local_20 = 0x14;
      puVar1 = (undefined4 *)FUN_00791bac(local_c,s_Error__Can_t_set_default__007a7a02);
      local_14 = local_14 + 1;
      (**(code **)(*local_40 + 0x38))(local_40,*puVar1);
      local_14 = local_14 + -1;
      FUN_00791d48(local_c,2);
    }
  }
  *in_FS_OFFSET = local_30;
  return;
}

