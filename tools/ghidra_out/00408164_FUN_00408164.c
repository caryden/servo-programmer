
int FUN_00408164(void)

{
  int iVar1;
  int in_stack_00000004;
  
  if (in_stack_00000004 == 0) {
    iVar1 = 0;
  }
  else {
    iVar1 = FUN_0078b358();
    iVar1 = iVar1 % in_stack_00000004;
  }
  return iVar1;
}

