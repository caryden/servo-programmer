
int FUN_004081b4(int param_1,char param_2)

{
  byte *pbVar1;
  uint uVar2;
  int iVar3;
  
  if ((-1 < param_2) && (param_2 < '\x02')) {
    uVar2 = (int)param_2 & 0x80000007;
    if ((int)uVar2 < 0) {
      uVar2 = (uVar2 - 1 | 0xfffffff8) + 1;
    }
    iVar3 = (int)param_2;
    if (iVar3 < 0) {
      iVar3 = iVar3 + 7;
    }
    pbVar1 = (byte *)(param_1 + (iVar3 >> 3));
    *pbVar1 = *pbVar1 | '\x01' << ((byte)uVar2 & 0x1f);
  }
  return param_1;
}

