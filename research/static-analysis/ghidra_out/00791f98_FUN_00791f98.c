
undefined4 FUN_00791f98(int *param_1,int param_2,int param_3,undefined4 param_4)

{
  undefined4 *puVar1;
  int iVar2;
  undefined4 uVar3;
  undefined2 in_FS;
  undefined4 local_30;
  undefined1 local_c [4];
  undefined4 local_8;
  
  FUN_00786a58(&DAT_007c3480);
  iVar2 = FUN_004081fc(param_1);
  if ((iVar2 < param_2) || (param_3 < 1)) {
    local_8 = 0;
    FUN_00791d78(param_4,&local_8);
    FUN_00791d48(&local_8,2);
    puVar1 = (undefined4 *)segment(in_FS,0);
    *puVar1 = local_30;
  }
  else {
    if (param_2 < 1) {
      param_2 = 1;
    }
    iVar2 = (iVar2 - param_2) + 1;
    if (param_3 < iVar2) {
      iVar2 = param_3;
    }
    uVar3 = FUN_00791c5c(local_c,*param_1 + param_2 + -1,iVar2);
    FUN_00791d78(param_4,uVar3);
    FUN_00791d48(local_c,2);
    puVar1 = (undefined4 *)segment(in_FS,0);
    *puVar1 = local_30;
  }
  return param_4;
}

