
undefined4 * FUN_00792830(undefined4 *param_1)

{
  undefined4 *puVar1;
  undefined4 uVar2;
  undefined4 *extraout_EDX;
  undefined2 in_FS;
  undefined4 local_2c;
  
  FUN_00786a58(&DAT_007c3b48);
  uVar2 = *extraout_EDX;
  *param_1 = 0;
  FUN_007025dc(param_1,uVar2);
  puVar1 = (undefined4 *)segment(in_FS,0);
  *puVar1 = local_2c;
  return param_1;
}

