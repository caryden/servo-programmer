
void _Cxmemo_TcxCustomMemo_GetLines_qqrv(undefined4 param_1)

{
  undefined1 *puVar1;
  undefined4 *in_FS_OFFSET;
  undefined4 uStack_18;
  undefined1 *puStack_14;
  undefined1 *puStack_10;
  int *local_8;
  
                    /* 0x2573e4  14192  @Cxmemo@TcxCustomMemo@GetLines$qqrv */
  puStack_10 = &stack0xfffffffc;
  local_8 = (int *)0x0;
  puStack_14 = &LAB_00657427;
  uStack_18 = *in_FS_OFFSET;
  *in_FS_OFFSET = &uStack_18;
  _Cxmemo_TcxCustomMemo_GetInnerMemo_qqrv(param_1,&local_8);
  (**(code **)(*local_8 + 0xd4))();
  puVar1 = puStack_10;
  *in_FS_OFFSET = uStack_18;
  puStack_10 = &LAB_0065742e;
  puStack_14 = (undefined1 *)0x657426;
  FUN_00703f6c(&local_8,uStack_18,puVar1);
  return;
}

