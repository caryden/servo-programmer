
void FUN_006f2bd8(undefined4 param_1,undefined4 param_2,undefined4 param_3,undefined4 param_4,
                 byte param_5)

{
  undefined1 *puVar1;
  int iVar2;
  int iVar3;
  undefined4 *in_FS_OFFSET;
  undefined4 *puVar4;
  int *piVar5;
  undefined4 uStack_30;
  undefined1 *puStack_2c;
  undefined1 *puStack_28;
  undefined4 local_18;
  undefined4 local_14;
  undefined4 local_10;
  int local_c;
  undefined4 local_8;
  
  puStack_28 = &stack0xfffffffc;
  local_c = 0;
  local_10 = 0;
  local_14 = 0;
  local_18 = 0;
  puStack_2c = &LAB_006f2cfb;
  uStack_30 = *in_FS_OFFSET;
  *in_FS_OFFSET = &uStack_30;
  local_8 = param_3;
  if ((param_5 & 2) == 0) {
    FUN_00701d7c(&local_c,param_1);
    FUN_00701d7c(&local_10,param_2);
  }
  else {
    puStack_28 = &stack0xfffffffc;
    FUN_006ecd34(param_1,&local_c);
    FUN_006ecd34(param_2,&local_10);
  }
  FUN_00701d7c(&local_14,param_1);
  FUN_00701ce4(param_4);
  do {
    if (local_c == 0) {
LAB_006f2ce0:
      puVar1 = puStack_28;
      *in_FS_OFFSET = uStack_30;
      puStack_28 = &LAB_006f2d02;
      puStack_2c = (undefined1 *)0x6f2cfa;
      FUN_00701d08(&local_18,4,puVar1);
      return;
    }
    iVar2 = FUN_006f23a8(local_10,local_c);
    if (iVar2 == 0) {
      FUN_00701fb4(param_4,local_14);
      goto LAB_006f2ce0;
    }
    FUN_00702204(local_14,1,iVar2 + -1,&local_18);
    FUN_0070206c(param_4,3);
    puVar4 = &local_14;
    iVar3 = FUN_00701fac(param_2);
    FUN_00702204(local_14,iVar3 + iVar2,0x7fffffff,puVar4);
    if ((param_5 & 1) == 0) {
      FUN_00701fb4(param_4,local_14);
      goto LAB_006f2ce0;
    }
    piVar5 = &local_c;
    iVar3 = FUN_00701fac(local_10);
    FUN_00702204(local_c,iVar3 + iVar2,0x7fffffff,piVar5);
  } while( true );
}

