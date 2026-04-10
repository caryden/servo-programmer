
void FUN_004080f0(undefined4 param_1,char param_2)

{
  char extraout_DL;
  undefined4 *in_FS_OFFSET;
  undefined4 local_2c;
  
  if ('\0' < param_2) {
    param_1 = FUN_007928c0();
    param_2 = extraout_DL;
  }
  FUN_00786a58(&DAT_007a8e80);
  FUN_00408ce8(param_1,0);
  *in_FS_OFFSET = local_2c;
  if (param_2 != '\0') {
    FUN_007928cd(param_1);
  }
  return;
}

