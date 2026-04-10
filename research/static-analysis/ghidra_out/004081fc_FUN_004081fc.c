
undefined4 FUN_004081fc(int *param_1)

{
  int iVar1;
  undefined4 uVar2;
  
  if (*param_1 == 0) {
    uVar2 = 0;
  }
  else {
    iVar1 = FUN_00408d70();
    uVar2 = *(undefined4 *)(iVar1 + 8);
  }
  return uVar2;
}

