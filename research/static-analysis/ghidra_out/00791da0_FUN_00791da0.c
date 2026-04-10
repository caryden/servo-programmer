
undefined4 FUN_00791da0(undefined4 *param_1,undefined4 *param_2,undefined4 param_3)

{
  undefined4 *puVar1;
  undefined2 in_FS;
  undefined4 local_30;
  undefined4 local_8;
  
  FUN_00786a58(&DAT_007c33c0);
  local_8 = 0;
  FUN_00701ff8(&local_8,*param_1,*param_2);
  FUN_00791d78(param_3,&local_8);
  FUN_00791d48(&local_8,2);
  puVar1 = (undefined4 *)segment(in_FS,0);
  *puVar1 = local_30;
  return param_3;
}

