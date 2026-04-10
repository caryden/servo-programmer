
undefined4 FUN_00791e5c(undefined4 param_1,undefined4 param_2)

{
  undefined4 *puVar1;
  undefined4 uVar2;
  undefined2 in_FS;
  undefined4 local_30;
  undefined1 local_c [4];
  undefined1 local_8 [4];
  
  FUN_00786a58(&DAT_007c3414);
  puVar1 = (undefined4 *)FUN_00791be4(local_c,param_2);
  uVar2 = *puVar1;
  puVar1 = (undefined4 *)FUN_00791be4(local_8,param_1);
  uVar2 = FUN_006ecdd4(*puVar1,uVar2);
  FUN_00791d48(local_c,2);
  FUN_00791d48(local_8,2);
  puVar1 = (undefined4 *)segment(in_FS,0);
  *puVar1 = local_30;
  return uVar2;
}

