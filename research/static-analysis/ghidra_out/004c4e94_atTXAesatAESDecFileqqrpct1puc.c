
undefined4
_TXAes_AESDecFile_qqrpct1puc(int param_1,undefined4 param_2,undefined4 param_3,undefined4 param_4)

{
  undefined4 uVar1;
  int iVar2;
  byte *pbVar3;
  uint uVar4;
  byte *pbVar5;
  undefined1 local_15c [256];
  undefined4 local_5c;
  undefined4 local_58;
  byte local_44 [16];
  byte local_34 [16];
  undefined1 local_24 [16];
  uint local_14;
  int local_10;
  int local_c;
  int local_8;
  
  local_8 = param_1;
                    /* 0xc4e94  3049  @TXAes@AESDecFile$qqrpct1puc */
  local_c = FUN_007886f8();
  if (local_c == 0) {
    uVar1 = 0;
  }
  else {
    local_10 = FUN_007886f8();
    if (local_10 == 0) {
      FUN_0078838c();
      uVar1 = 0;
    }
    else {
      local_58 = 0x10;
      local_5c = 0;
      _TXAes_aes_dec_key_qqrxpxucuip7aes_ctx
                (local_8,param_4,*(undefined4 *)(local_8 + 0x30),local_15c);
      FUN_00788938();
      _TXAes_aes_dec_blk_qqrxpxucpucxpx7aes_ctx(local_8,local_24,&DAT_007c60c8,local_15c);
      if ((DAT_007c60cc == 'x') && (DAT_007c60cd == 'x')) {
        local_14 = _TXAes_GetFileSize_qqrp8std_FILE(local_8,local_c);
        if (DAT_007c60c8 <= (int)local_14) {
          uVar4 = local_14 & 0x8000000f;
          if ((int)uVar4 < 0) {
            uVar4 = (uVar4 - 1 | 0xfffffff0) + 1;
          }
          if (uVar4 == 0) {
            local_14 = DAT_007c60c8;
            FUN_00786704();
            while( true ) {
              if ((int)local_14 < 1) {
                FUN_0078838c();
                FUN_0078838c();
                return 1;
              }
              iVar2 = FUN_00788938();
              if (iVar2 != 0x10) break;
              FUN_00786694();
              _TXAes_aes_dec_blk_qqrxpxucpucxpx7aes_ctx(local_8,local_24,local_34,local_15c);
              iVar2 = 0;
              pbVar5 = local_34;
              pbVar3 = local_44;
              do {
                *pbVar5 = *pbVar5 ^ *pbVar3;
                iVar2 = iVar2 + 1;
                pbVar5 = pbVar5 + 1;
                pbVar3 = pbVar3 + 1;
              } while (iVar2 < 0x10);
              FUN_00786694();
              if ((int)local_14 < 0x10) {
                FUN_00788ad8();
              }
              else {
                FUN_00788ad8();
              }
              local_14 = local_14 + -0x10;
            }
            FUN_0078838c();
            FUN_0078838c();
            return 0xfffffffd;
          }
        }
        iVar2 = local_c;
        uVar1 = FUN_0078838c();
        FUN_0078838c(uVar1,local_10,iVar2,local_10);
        uVar1 = 0xfffffffe;
      }
      else {
        iVar2 = local_c;
        uVar1 = FUN_0078838c();
        FUN_0078838c(uVar1,local_10,iVar2,local_10);
        uVar1 = 0xffffffff;
      }
    }
  }
  return uVar1;
}

