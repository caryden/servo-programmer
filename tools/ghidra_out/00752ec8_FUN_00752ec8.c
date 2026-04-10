
void FUN_00752ec8(int param_1,char param_2)

{
  if (param_2 != *(char *)(param_1 + 0x57)) {
    FUN_00701150(param_1);
    *(char *)(param_1 + 0x57) = param_2;
    FUN_00754190(param_1,0xb00b,param_2,0);
    FUN_00701150(param_1);
  }
  return;
}

