
void FUN_00746930(int param_1,char param_2)

{
  if (param_2 != *(char *)(param_1 + 0x40)) {
    *(char *)(param_1 + 0x40) = param_2;
    FUN_007468a4();
  }
  return;
}

