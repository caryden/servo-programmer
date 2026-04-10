
undefined4 FUN_00404a28(int param_1)

{
  undefined4 *puVar1;
  undefined4 uVar2;
  undefined4 *in_FS_OFFSET;
  char local_78 [64];
  int *local_38;
  undefined4 local_34;
  int local_30;
  undefined4 local_2c;
  undefined2 local_1c;
  int local_10;
  undefined1 local_8 [4];
  
  local_30 = param_1;
  FUN_00786a58(&DAT_007a82e8);
  FUN_004047d0(local_30,CONCAT31((int3)((uint)local_78 >> 8),0x91),0,local_78,0x20);
  if (local_78[0] == '\0') {
    local_34 = 0x100;
    FUN_00404900(local_30,0x90,CONCAT22((short)((uint)local_78 >> 0x10),0x100),local_78,0x20);
    FUN_004047d0(local_30,0x91,0,local_78,0x20);
    if (local_78[0] == '\x01') {
      local_38 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_30 + 0x45c));
      local_1c = 8;
      puVar1 = (undefined4 *)FUN_00791bac(local_8,s_Initial_read_parameter__007a763d);
      local_10 = local_10 + 1;
      (**(code **)(*local_38 + 0x38))(local_38,*puVar1);
      local_10 = local_10 + -1;
      FUN_00791d48(local_8,2);
      uVar2 = 1;
      *in_FS_OFFSET = local_2c;
    }
    else {
      uVar2 = 0;
      *in_FS_OFFSET = local_2c;
    }
  }
  else if (local_78[0] == '\x01') {
    uVar2 = 1;
    *in_FS_OFFSET = local_2c;
  }
  else {
    uVar2 = 0;
    *in_FS_OFFSET = local_2c;
  }
  return uVar2;
}

