
void FUN_00752fd8(undefined4 param_1,undefined4 param_2)

{
  undefined1 *puVar1;
  undefined4 uVar2;
  undefined4 *in_FS_OFFSET;
  undefined1 uVar3;
  undefined4 uStack_1c;
  undefined1 *puStack_18;
  undefined1 *puStack_14;
  undefined4 local_8;
  
  puStack_14 = &stack0xfffffffc;
  local_8 = 0;
  uVar3 = 1;
  puStack_18 = &LAB_0075302d;
  uStack_1c = *in_FS_OFFSET;
  *in_FS_OFFSET = &uStack_1c;
  FUN_00752fa8(param_1,&local_8);
  FUN_007020f0(local_8,param_2);
  if (!(bool)uVar3) {
    uVar2 = FUN_007021a4(param_2);
    FUN_00752f84(param_1,uVar2);
  }
  puVar1 = puStack_14;
  *in_FS_OFFSET = uStack_1c;
  puStack_14 = &LAB_00753034;
  puStack_18 = (undefined1 *)0x75302c;
  FUN_00701ce4(&local_8,uStack_1c,puVar1);
  return;
}

