
void FUN_00402948(int param_1,undefined4 param_2,undefined4 param_3)

{
  undefined4 uVar1;
  undefined4 *in_FS_OFFSET;
  undefined4 local_40;
  undefined4 local_1c;
  undefined1 local_18 [4];
  undefined1 local_14 [4];
  undefined1 local_10 [4];
  undefined1 local_c [4];
  undefined1 local_8 [4];
  
  FUN_00786a58(&DAT_007a7ba4,param_2,param_3,param_2);
  FUN_004021f4(local_8);
  if (*(int *)(*(int *)(param_1 + 0x354) + 0x220) == 0) {
    FUN_00791bac(local_c,s_500_2500_us_007a72e0);
    FUN_00791d78(local_8,local_c);
    FUN_00791d48(local_c,2);
  }
  if (*(int *)(*(int *)(param_1 + 0x354) + 0x220) == 1) {
    FUN_00791bac(local_10,s_900_2100_us_007a72ec);
    FUN_00791d78(local_8,local_10);
    FUN_00791d48(local_10,2);
  }
  if (*(int *)(*(int *)(param_1 + 0x354) + 0x220) == 2) {
    FUN_00791bac(local_14,s_1100_1900_us_007a72f8);
    FUN_00791d78(local_8,local_14);
    FUN_00791d48(local_14,2);
  }
  if (*(int *)(*(int *)(param_1 + 0x354) + 0x220) == 3) {
    FUN_00791bac(local_18,s_500_2500_us_007a7305);
    FUN_00791d78(local_8,local_18);
    FUN_00791d48(local_18,2);
  }
  uVar1 = FUN_004021f4(&local_1c);
  FUN_00792194(s_PPM_Range__007a7311,local_8,uVar1);
  FUN_00752fd8(*(undefined4 *)(param_1 + 0x32c),local_1c);
  FUN_00791d48(&local_1c,2);
  FUN_00752ec8(*(undefined4 *)(param_1 + 0x354),0);
  FUN_00791d48(local_8,2);
  *in_FS_OFFSET = local_40;
  return;
}

