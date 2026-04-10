
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_004065b0(int param_1,undefined4 param_2)

{
  byte bVar1;
  char cVar2;
  undefined4 *puVar3;
  undefined4 uVar4;
  int iVar5;
  uint uVar6;
  undefined4 uVar7;
  byte *pbVar8;
  int iVar9;
  undefined3 extraout_var;
  undefined3 uVar10;
  undefined4 *in_FS_OFFSET;
  undefined1 *puVar11;
  undefined1 auStack_304 [16];
  undefined1 auStack_2f4 [256];
  byte abStack_1f4 [64];
  byte abStack_1b4 [64];
  int *piStack_174;
  int *piStack_170;
  int *piStack_16c;
  int *piStack_168;
  int *piStack_164;
  int *piStack_160;
  char cStack_15b;
  char cStack_15a;
  byte bStack_159;
  int iStack_158;
  int *piStack_154;
  char cStack_14e;
  char cStack_14d;
  int iStack_14c;
  int *piStack_148;
  int *piStack_144;
  int *piStack_140;
  undefined1 uStack_139;
  int *piStack_138;
  undefined1 uStack_131;
  int *piStack_130;
  int iStack_12c;
  int iStack_128;
  int *piStack_124;
  int *piStack_120;
  int *piStack_11c;
  int *piStack_118;
  int *piStack_114;
  undefined4 uStack_110;
  char cStack_10b;
  char cStack_10a;
  char cStack_109;
  undefined4 uStack_108;
  int iStack_104;
  undefined4 uStack_100;
  undefined2 uStack_f0;
  int iStack_e4;
  undefined1 auStack_dc [4];
  undefined1 auStack_d8 [4];
  undefined4 uStack_d4;
  undefined1 auStack_d0 [4];
  undefined1 auStack_cc [4];
  undefined1 auStack_c8 [4];
  undefined4 uStack_c4;
  undefined4 uStack_c0;
  undefined1 auStack_bc [4];
  undefined1 auStack_b8 [4];
  undefined1 auStack_b4 [4];
  undefined1 auStack_b0 [4];
  undefined1 auStack_ac [4];
  undefined4 uStack_a8;
  undefined1 auStack_a4 [4];
  undefined4 uStack_a0;
  undefined1 auStack_9c [4];
  undefined1 auStack_98 [4];
  undefined1 auStack_94 [4];
  undefined1 auStack_90 [4];
  undefined1 auStack_8c [4];
  undefined1 auStack_88 [4];
  undefined1 auStack_84 [4];
  undefined1 auStack_80 [4];
  undefined1 auStack_7c [4];
  undefined1 auStack_78 [4];
  undefined1 auStack_74 [4];
  undefined1 auStack_70 [4];
  undefined1 auStack_6c [4];
  undefined1 auStack_68 [4];
  undefined1 auStack_64 [4];
  undefined1 auStack_60 [4];
  undefined1 auStack_5c [4];
  undefined1 auStack_58 [4];
  undefined1 auStack_54 [4];
  undefined4 uStack_50;
  undefined1 auStack_4c [4];
  undefined4 uStack_48;
  undefined1 auStack_44 [4];
  undefined1 auStack_40 [4];
  undefined1 auStack_3c [4];
  undefined1 auStack_38 [4];
  undefined1 auStack_34 [4];
  undefined1 auStack_30 [4];
  undefined4 uStack_2c;
  undefined1 auStack_28 [4];
  undefined1 auStack_24 [4];
  undefined4 uStack_20;
  undefined1 auStack_1c [4];
  undefined1 auStack_18 [4];
  undefined1 auStack_14 [4];
  undefined4 uStack_10;
  undefined1 auStack_c [4];
  undefined1 auStack_8 [4];
  
  uStack_108 = param_2;
  iStack_104 = param_1;
  FUN_00786a58(0x7a88cc);
  uStack_f0 = 8;
  FUN_004021f4(auStack_8);
  iStack_e4 = iStack_e4 + 1;
  uStack_f0 = 0x20;
  FUN_004021f4(auStack_c);
  iStack_e4 = iStack_e4 + 1;
  uStack_f0 = 0x2c;
  FUN_004021f4(&uStack_10);
  iStack_e4 = iStack_e4 + 1;
  uStack_f0 = 0x14;
  cStack_10b = '\0';
  uStack_110 = 0x4b00;
  FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),0);
  if ((DAT_007c5231 == '\0') || (DAT_007a7246 == '\x01')) {
    piStack_114 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(iStack_104 + 0x45c));
    uStack_f0 = 0x38;
    puVar3 = (undefined4 *)FUN_00791bac(auStack_14,s_Error__Please_check_connect_of_m_007a76af);
    iStack_e4 = iStack_e4 + 1;
    (**(code **)(*piStack_114 + 0x38))(piStack_114,*puVar3);
    iStack_e4 = iStack_e4 + -1;
    FUN_00791d48(auStack_14,2);
    iStack_e4 = iStack_e4 + -1;
    FUN_00791d48(&uStack_10,2);
    iStack_e4 = iStack_e4 + -1;
    FUN_00791d48(auStack_c,2);
    iStack_e4 = iStack_e4 + -1;
    FUN_00791d48(auStack_8,2);
    *in_FS_OFFSET = uStack_100;
  }
  else {
    if (DAT_007c5234 == 0) {
      uStack_f0 = 0x44;
      uVar4 = FUN_00403cc4(auStack_18);
      iStack_e4 = iStack_e4 + 1;
      _Jvhidcontrollerclass_TJvHidDevice_GetProductName_qqrv(DAT_007c5184,uVar4);
      puVar11 = auStack_18;
      FUN_007927f8(auStack_1c,0x7a76d6);
      iStack_e4 = iStack_e4 + 1;
      iVar5 = FUN_0079289c(puVar11,auStack_1c);
      uVar6 = (uint)(0 < iVar5);
      iStack_e4 = iStack_e4 + -1;
      FUN_0079286c(auStack_1c,2);
      iStack_e4 = iStack_e4 + -1;
      FUN_0079286c(auStack_18,2);
      if (uVar6 != 0) {
        DAT_007c52ac = 4;
        DAT_007c52ad = 0x90;
        DAT_007c52ae = 0;
        uVar6 = _Jvhidcontrollerclass_TJvHidDevice_WriteFile_qqrpvuirui
                          (DAT_007c5184,&DAT_007c52ac,0x40,&DAT_007c52ec);
        DAT_007c52f4 = uVar6 & 0xff;
        bVar1 = _Jvhidcontrollerclass_TJvHidDevice_ReadFile_qqrpvuirui
                          (DAT_007c5184,&DAT_007c526c,0x40,&DAT_007c52ec);
        DAT_007c52f4 = (uint)bVar1;
        cStack_10b = '\x01';
        FUN_00403ffc(iStack_104,uStack_108);
      }
    }
    abStack_1f4[1] = 1;
    abStack_1f4[2] = 2;
    abStack_1f4[3] = 3;
    abStack_1f4[4] = 4;
    FUN_00408220(iStack_104,0x80,abStack_1f4,5);
    Sleep(5);
    FUN_004082f0(iStack_104,abStack_1b4,6);
    if (abStack_1b4[0] == 0x56) {
      uStack_f0 = 0x50;
      FUN_004021f4(&uStack_20);
      iStack_e4 = iStack_e4 + 1;
      uStack_f0 = 0x5c;
      FUN_00791f0c();
      piStack_118 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(iStack_104 + 0x45c));
      (**(code **)(*piStack_118 + 0x38))(piStack_118,uStack_20);
      DAT_007c51e8 = 1;
      DAT_007c51e9 = abStack_1b4[4];
      DAT_007c51ea = abStack_1b4[5];
      DAT_007c5230 = 0;
      if ((abStack_1b4[3] == '2') && (abStack_1b4[1] == '0')) {
        piStack_11c = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                       (*(undefined4 *)(iStack_104 + 0x45c));
        uStack_f0 = 0x68;
        puVar3 = (undefined4 *)FUN_00791bac(auStack_24,s_Boot_Version_is_too_old__Can_t_u_007a76f0);
        iStack_e4 = iStack_e4 + 1;
        (**(code **)(*piStack_11c + 0x38))(piStack_11c,*puVar3);
        iStack_e4 = iStack_e4 + -1;
        FUN_00791d48(auStack_24,2);
        DAT_007c51e8 = 0;
        func_0x00408810(iStack_104);
        FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),1);
        iStack_e4 = iStack_e4 + -1;
        FUN_00791d48(&uStack_20,2);
        iStack_e4 = iStack_e4 + -1;
        FUN_00791d48(&uStack_10,2);
        iStack_e4 = iStack_e4 + -1;
        FUN_00791d48(auStack_c,2);
        iStack_e4 = iStack_e4 + -1;
        FUN_00791d48(auStack_8,2);
        *in_FS_OFFSET = uStack_100;
      }
      else {
        iStack_e4 = iStack_e4 + -1;
        FUN_00791d48(&uStack_20,2);
        uStack_f0 = 0x14;
        iVar5 = *(int *)(iStack_104 + 0x2fc);
        *(undefined4 *)(iVar5 + 100) = 2;
        piStack_124 = (int *)FUN_004080f0(&PTR_FUN_006d5f7c,CONCAT31((int3)((uint)iVar5 >> 8),1));
        uStack_f0 = 0x14;
        cVar2 = (**(code **)(**(int **)(iStack_104 + 0x2fc) + 0x3c))();
        if (cVar2 == '\0') {
LAB_00407ff3:
          uStack_f0 = 0x14;
          DAT_007c5230 = 0;
          DAT_007c51e8 = 0;
          abStack_1f4[0] = 0xff;
          abStack_1f4[1] = 0x55;
          abStack_1f4[2] = 0xaa;
          FUN_00408220(iStack_104,0x83,abStack_1f4,0x16);
          if (DAT_007c5231 != '\0') {
            FUN_004082f0(iStack_104,abStack_1b4,1);
          }
          piStack_174 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                         (*(undefined4 *)(iStack_104 + 0x45c));
          uStack_f0 = 0x218;
          puVar3 = (undefined4 *)
                   FUN_00791bac(auStack_dc,s_Error_Update_please_check_connec_007a7986);
          iStack_e4 = iStack_e4 + 1;
          (**(code **)(*piStack_174 + 0x38))(piStack_174,*puVar3);
          iStack_e4 = iStack_e4 + -1;
          FUN_00791d48(auStack_dc,2);
          iStack_e4 = iStack_e4 + -1;
          FUN_00791d48(&uStack_10,2);
          iStack_e4 = iStack_e4 + -1;
          FUN_00791d48(auStack_c,2);
          iStack_e4 = iStack_e4 + -1;
          FUN_00791d48(auStack_8,2);
          *in_FS_OFFSET = uStack_100;
        }
        else {
          puVar11 = auStack_2f4;
          uVar4 = 0xff;
          func_0x007a5a32();
          FUN_00786704();
          _TXAes_SetKeyLen_qqri(*(undefined4 *)(iStack_104 + 0x2f8),0x10,iStack_104,uVar4,puVar11);
          uStack_f0 = 0x8c;
          FUN_00791bac(&uStack_2c,auStack_2f4);
          iStack_e4 = iStack_e4 + 1;
          uStack_f0 = 0x98;
          uVar4 = FUN_004021f4(auStack_34);
          iStack_e4 = iStack_e4 + 1;
          FUN_00791bac(auStack_30,0x7a774e);
          iStack_e4 = iStack_e4 + 1;
          FUN_00791da0(&uStack_2c,auStack_30,uVar4);
          FUN_00791d78(&uStack_2c,auStack_34);
          iStack_e4 = iStack_e4 + -1;
          FUN_00791d48(auStack_34,2);
          iStack_e4 = iStack_e4 + -1;
          FUN_00791d48(auStack_30,2);
          puVar11 = auStack_304;
          uStack_f0 = 0xa4;
          uVar4 = FUN_004021f4(auStack_38);
          iStack_e4 = iStack_e4 + 1;
          FUN_0074bd30(*(undefined4 *)(iStack_104 + 0x2fc),uVar4,iStack_104,puVar11);
          uVar4 = FUN_00408144(auStack_38);
          uVar7 = FUN_00408144(&uStack_2c);
          _TXAes_AESDecFile_qqrpct1puc(*(undefined4 *)(iStack_104 + 0x2f8),uVar4,uVar7,puVar11);
          iStack_e4 = iStack_e4 + -1;
          FUN_00791d48(auStack_38,2);
          (**(code **)(*piStack_124 + 0x68))(piStack_124,uStack_2c);
          func_0x00791b20(uStack_2c);
          iStack_e4 = iStack_e4 + -1;
          FUN_00791d48(&uStack_2c,2);
          iStack_128 = 0;
          uStack_f0 = 0x14;
          do {
            bVar1 = FUN_00408164();
            abStack_1f4[iStack_128] = bVar1;
            iStack_128 = iStack_128 + 1;
          } while (iStack_128 < 0x16);
          FUN_00408220(iStack_104,0x81,abStack_1f4,0x16);
          iVar5 = FUN_004082f0(iStack_104,abStack_1b4,0x16);
          if (iVar5 == 0) {
            DAT_007c5230 = 0;
            func_0x00408810(iStack_104);
            FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),1);
            piStack_130 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                           (*(undefined4 *)(iStack_104 + 0x45c));
            uStack_f0 = 0xb0;
            puVar3 = (undefined4 *)
                     FUN_00791bac(auStack_3c,s_Error_Update_01_please_check_con_007a775b);
            iStack_e4 = iStack_e4 + 1;
            (**(code **)(*piStack_130 + 0x38))(piStack_130,*puVar3);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_3c,2);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(&uStack_10,2);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_c,2);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_8,2);
            *in_FS_OFFSET = uStack_100;
          }
          else {
            iStack_12c = 0;
            uStack_f0 = 0x14;
            do {
              *(byte *)(iStack_12c + 0x7c51f0) = abStack_1f4[iStack_12c] ^ abStack_1b4[iStack_12c];
              iStack_12c = iStack_12c + 1;
            } while (iStack_12c < 0x16);
            DAT_007c5230 = 1;
            uStack_f0 = 0xbc;
            uVar4 = FUN_004021f4(auStack_40);
            iStack_e4 = iStack_e4 + 1;
            (**(code **)(*piStack_124 + 0xc))(piStack_124,0,uVar4);
            FUN_00791d78(auStack_8,auStack_40);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_40,2);
            uStack_f0 = 200;
            uVar4 = FUN_004021f4(auStack_44);
            iStack_e4 = iStack_e4 + 1;
            FUN_00791f98(auStack_8,2,2,uVar4);
            puVar11 = auStack_44;
            uVar4 = FUN_004021f4(&uStack_48);
            iStack_e4 = iStack_e4 + 1;
            FUN_00792194(0x7a7781,puVar11,uVar4);
            cStack_109 = FUN_006ed450(uStack_48);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(&uStack_48,2);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_44,2);
            uStack_f0 = 0xd4;
            uVar4 = FUN_004021f4(auStack_4c);
            iStack_e4 = iStack_e4 + 1;
            FUN_00791f98(auStack_8,4,2,uVar4);
            puVar11 = auStack_4c;
            uVar4 = FUN_004021f4(&uStack_50);
            iStack_e4 = iStack_e4 + 1;
            FUN_00792194(0x7a7783,puVar11,uVar4);
            cStack_10a = FUN_006ed450(uStack_50);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(&uStack_50,2);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_4c,2);
            uStack_f0 = 0xe0;
            uVar4 = FUN_004021f4(auStack_54);
            iStack_e4 = iStack_e4 + 1;
            FUN_00791f98(auStack_8,6,8,uVar4);
            FUN_00791d78(&uStack_10,auStack_54);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_54,2);
            uStack_f0 = 0xec;
            uVar4 = FUN_00408180(&uStack_131);
            pbVar8 = (byte *)FUN_004081b4(uVar4,0);
            uVar6 = (uint)*pbVar8;
            uVar7 = FUN_004021f4(auStack_60);
            iStack_e4 = iStack_e4 + 1;
            puVar3 = (undefined4 *)FUN_00791bac(auStack_5c,0x7a7787);
            iStack_e4 = iStack_e4 + 1;
            uVar4 = *puVar3;
            puVar3 = (undefined4 *)FUN_00791bac(auStack_58,0x7a7785);
            iStack_e4 = iStack_e4 + 1;
            FUN_006f2bd8(uStack_10,*puVar3,uVar4,uVar7,uVar6);
            FUN_00791d78(&uStack_10,auStack_60);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_60,2);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_5c,2);
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_58,2);
            uStack_f0 = 0xf8;
            FUN_00791bac(auStack_64,0x7a7788);
            iStack_e4 = iStack_e4 + 1;
            iVar5 = FUN_00791f74(auStack_8,auStack_64);
            cVar2 = 0 < iVar5;
            iStack_e4 = iStack_e4 + -1;
            FUN_00791d48(auStack_64,2);
            if (cVar2 == '\0') {
              func_0x00408810(iStack_104);
              FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),1);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(&uStack_10,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_c,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_8,2);
              *in_FS_OFFSET = uStack_100;
            }
            else if ((cStack_109 == DAT_007c51e9) && (cStack_10a == DAT_007c51ea)) {
              uStack_f0 = 0x11c;
              uVar4 = FUN_00408180(&uStack_139);
              pbVar8 = (byte *)FUN_004081b4(uVar4,0);
              uVar6 = (uint)*pbVar8;
              uVar7 = FUN_004021f4(auStack_68);
              iStack_e4 = iStack_e4 + 1;
              puVar3 = (undefined4 *)FUN_00791bac(auStack_74,0x7a77ae);
              iStack_e4 = iStack_e4 + 1;
              uVar4 = *puVar3;
              puVar3 = (undefined4 *)FUN_00791bac(auStack_70,0x7a77ac);
              iStack_e4 = iStack_e4 + 1;
              FUN_006f2bd8(_DAT_007c51ec,*puVar3,uVar4,uVar7,uVar6);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_74,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_70,2);
              uStack_f0 = 0x110;
              iVar5 = FUN_004081fc(auStack_68);
              if ((iVar5 < 2) && (DAT_007c5234 == 0)) {
                uStack_f0 = 0x128;
                FUN_004021f4(auStack_78);
                iStack_e4 = iStack_e4 + 1;
                uStack_f0 = 0x140;
                FUN_00791bac(auStack_7c,s_Unable_to_determine_the_current_m_007a77af);
                iStack_e4 = iStack_e4 + 1;
                FUN_00791d78(auStack_78,auStack_7c);
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(auStack_7c,2);
                FUN_00791d8c(auStack_78,&uStack_10);
                uStack_f0 = 0x14c;
                FUN_00791bac(auStack_80,s___If_you_select_an_inappropriate_007a7818);
                iStack_e4 = iStack_e4 + 1;
                FUN_00791d8c(auStack_78,auStack_80);
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(auStack_80,2);
                uStack_f0 = 0x158;
                puVar3 = (undefined4 *)FUN_00792830(auStack_84,auStack_78);
                iStack_e4 = iStack_e4 + 1;
                _Ilabel_TiLabel_SetCaption_qqrx17System_WideString
                          (*(undefined4 *)(*(int *)PTR__Form2_007c4458 + 0x2f4),*puVar3);
                iStack_e4 = iStack_e4 + -1;
                FUN_0079286c(auStack_84,2);
                FUN_00752714(*(undefined4 *)PTR__Form2_007c4458,*(int *)(_Form1 + 0x44) + 200);
                FUN_007526f0(*(undefined4 *)PTR__Form2_007c4458,*(int *)(_Form1 + 0x40) + 0xaa);
                (**(code **)(**(int **)PTR__Form2_007c4458 + 0xe8))();
                if (*(int *)(*(int *)PTR__Form2_007c4458 + 0x300) == 0) {
                  func_0x00408810(iStack_104);
                  FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),1);
                  piStack_140 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                                 (*(undefined4 *)(iStack_104 + 0x45c));
                  uStack_f0 = 0x164;
                  puVar3 = (undefined4 *)
                           FUN_00791bac(auStack_88,s_Error_1032_Firmware_upgrade_is_t_007a78ac);
                  iStack_e4 = iStack_e4 + 1;
                  (**(code **)(*piStack_140 + 0x38))(piStack_140,*puVar3);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_88,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_78,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_68,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(&uStack_10,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_c,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_8,2);
                  *in_FS_OFFSET = uStack_100;
                  return;
                }
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(auStack_78,2);
                uStack_f0 = 0x110;
              }
              else {
                iVar5 = FUN_00791e5c(&uStack_10,auStack_68);
                if (iVar5 != 0) {
                  func_0x00408810(iStack_104);
                  FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),1);
                  piStack_144 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                                 (*(undefined4 *)(iStack_104 + 0x45c));
                  uStack_f0 = 0x170;
                  puVar3 = (undefined4 *)
                           FUN_00791bac(auStack_8c,s_Error_1031_Firmware_is_incorrect_007a78d7);
                  iStack_e4 = iStack_e4 + 1;
                  (**(code **)(*piStack_144 + 0x38))(piStack_144,*puVar3);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_8c,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_68,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(&uStack_10,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_c,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_8,2);
                  *in_FS_OFFSET = uStack_100;
                  return;
                }
              }
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_68,2);
              uStack_f0 = 0x14;
              piStack_148 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                             (*(undefined4 *)(iStack_104 + 0x45c));
              uStack_f0 = 0x17c;
              puVar3 = (undefined4 *)
                       FUN_00791bac(auStack_90,s_Update____Don_t_Remove_device__007a78f9);
              iStack_e4 = iStack_e4 + 1;
              (**(code **)(*piStack_148 + 0x38))(piStack_148,*puVar3);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_90,2);
              FUN_007534e4(*(undefined4 *)(iStack_104 + 0x45c));
              iStack_14c = 0;
              uStack_f0 = 0x14;
              while (iVar5 = (**(code **)(*piStack_124 + 0x14))(), iStack_14c < iVar5) {
                uStack_f0 = 0x188;
                uVar4 = FUN_004021f4(auStack_94);
                iStack_e4 = iStack_e4 + 1;
                (**(code **)(*piStack_124 + 0xc))(piStack_124,iStack_14c,uVar4);
                FUN_00791d78(auStack_8,auStack_94);
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(auStack_94,2);
                uStack_f0 = 0x194;
                FUN_00791bac(auStack_98,0x7a7918);
                iStack_e4 = iStack_e4 + 1;
                iVar5 = FUN_00791f74(auStack_8,auStack_98);
                cVar2 = 0 < iVar5;
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(auStack_98,2);
                if (cVar2 != '\0') {
                  FUN_00786704();
                  abStack_1f4[0] = 10;
                  uStack_f0 = 0x1a0;
                  uVar4 = FUN_004021f4(auStack_9c);
                  iStack_e4 = iStack_e4 + 1;
                  FUN_00791f98(auStack_8,2,2,uVar4);
                  puVar11 = auStack_9c;
                  uVar4 = FUN_004021f4(&uStack_a0);
                  iStack_e4 = iStack_e4 + 1;
                  FUN_00792194(0x7a791a,puVar11,uVar4);
                  abStack_1f4[1] = FUN_006ed450(uStack_a0);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(&uStack_a0,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_9c,2);
                  uStack_f0 = 0x1ac;
                  uVar4 = FUN_004021f4(auStack_a4);
                  iStack_e4 = iStack_e4 + 1;
                  FUN_00791f98(auStack_8,4,2,uVar4);
                  puVar11 = auStack_a4;
                  uVar4 = FUN_004021f4(&uStack_a8);
                  iStack_e4 = iStack_e4 + 1;
                  FUN_00792194(0x7a791c,puVar11,uVar4);
                  abStack_1f4[2] = FUN_006ed450(uStack_a8);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(&uStack_a8,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_a4,2);
                  uStack_f0 = 0x14;
                  for (cStack_14d = '\x03'; cStack_14d < '\x16'; cStack_14d = cStack_14d + '\x01') {
                    bVar1 = FUN_00408164();
                    abStack_1f4[cStack_14d] = bVar1;
                  }
                  uStack_f0 = 0x14;
                  for (cStack_14e = '\0'; cStack_14e < '\x16'; cStack_14e = cStack_14e + '\x01') {
                    abStack_1f4[cStack_14e] =
                         abStack_1f4[cStack_14e] ^ *(byte *)(cStack_14e + 0x7c51f0);
                  }
                  FUN_00408220(iStack_104,CONCAT31(cStack_14e >> 7,0x82),abStack_1f4,0x16);
                  abStack_1b4[0] = 0;
                  FUN_004082f0(iStack_104,abStack_1b4,1);
                  if (abStack_1b4[0] != 0x55) {
                    piStack_154 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                                   (*(undefined4 *)(iStack_104 + 0x45c));
                    uStack_f0 = 0x1b8;
                    puVar3 = (undefined4 *)
                             FUN_00791bac(auStack_ac,s_Error_Update_02_Erase_error__007a791e);
                    iStack_e4 = iStack_e4 + 1;
                    (**(code **)(*piStack_154 + 0x38))(piStack_154,*puVar3);
                    iStack_e4 = iStack_e4 + -1;
                    FUN_00791d48(auStack_ac,2);
                    goto LAB_00407ff3;
                  }
                }
                uStack_f0 = 0x1c4;
                FUN_00791bac(auStack_b0,0x7a793b);
                iStack_e4 = iStack_e4 + 1;
                iVar5 = FUN_00791f74(auStack_8,auStack_b0);
                if (iVar5 < 1) {
LAB_00407a1b:
                  cVar2 = '\0';
                }
                else {
                  uVar4 = FUN_004021f4(auStack_b4);
                  iStack_e4 = iStack_e4 + 1;
                  FUN_00791f98(auStack_8,8,2,uVar4);
                  puVar11 = auStack_b4;
                  FUN_00791bac(auStack_b8,0x7a793d);
                  iStack_e4 = iStack_e4 + 1;
                  cVar2 = FUN_00791e2c(puVar11,auStack_b8);
                  uVar6 = (uint)(cVar2 != '\0');
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_b8,2);
                  iStack_e4 = iStack_e4 + -1;
                  FUN_00791d48(auStack_b4,2);
                  if (uVar6 == 0) goto LAB_00407a1b;
                  cVar2 = '\x01';
                }
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(auStack_b0,2);
                if (cVar2 != '\0') {
                  FUN_00786704();
                  abStack_1f4[0] = 0x3a;
                  iStack_158 = 0;
                  uStack_f0 = 0x14;
                  while( true ) {
                    iVar5 = FUN_004081fc(auStack_8);
                    iVar9 = (int)(iVar5 - 1U) >> 1;
                    if (iVar9 < 0) {
                      iVar9 = iVar9 + (uint)((iVar5 - 1U & 1) != 0);
                    }
                    if (iVar9 <= iStack_158) break;
                    uStack_f0 = 0x1d0;
                    uVar4 = FUN_004021f4(auStack_bc);
                    iStack_e4 = iStack_e4 + 1;
                    FUN_00791f98(auStack_8,iStack_158 * 2 + 2,2,uVar4);
                    puVar11 = auStack_bc;
                    uVar4 = FUN_004021f4(&uStack_c0);
                    iStack_e4 = iStack_e4 + 1;
                    FUN_00792194(0x7a7940,puVar11,uVar4);
                    bVar1 = FUN_006ed450(uStack_c0);
                    abStack_1f4[iStack_158 + 1] = bVar1;
                    iStack_e4 = iStack_e4 + -1;
                    FUN_00791d48(&uStack_c0,2);
                    iStack_e4 = iStack_e4 + -1;
                    FUN_00791d48(auStack_bc,2);
                    iStack_158 = iStack_158 + 1;
                  }
                  bStack_159 = abStack_1f4[abStack_1f4[1] + 5];
                  uStack_f0 = 0x14;
                  if (abStack_1f4[1] + 5 < 0x16) {
                    for (cStack_15a = abStack_1f4[1] + 5; cStack_15a < '\x16';
                        cStack_15a = cStack_15a + '\x01') {
                      bVar1 = FUN_00408164();
                      abStack_1f4[cStack_15a] = bVar1;
                    }
                  }
                  uStack_f0 = 0x14;
                  for (cStack_15b = '\0'; cStack_15b < '\x16'; cStack_15b = cStack_15b + '\x01') {
                    abStack_1f4[cStack_15b] =
                         abStack_1f4[cStack_15b] ^ *(byte *)(cStack_15b + 0x7c51f0);
                  }
                  FUN_00408220(iStack_104,CONCAT31(cStack_15b >> 7,0x82),abStack_1f4,0x16);
                  abStack_1b4[0] = 0;
                  FUN_004082f0(iStack_104,abStack_1b4,1);
                  if (abStack_1b4[0] != bStack_159) {
                    piStack_160 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                                   (*(undefined4 *)(iStack_104 + 0x45c));
                    uStack_f0 = 0x1dc;
                    puVar3 = (undefined4 *)
                             FUN_00791bac(auStack_c8,s_Error_Update_02_Write_error__007a7942);
                    iStack_e4 = iStack_e4 + 1;
                    (**(code **)(*piStack_160 + 0x38))(piStack_160,*puVar3);
                    iStack_e4 = iStack_e4 + -1;
                    FUN_00791d48(auStack_c8,2);
                    uStack_f0 = 0x1e8;
                    FUN_004021f4(&uStack_c4);
                    iStack_e4 = iStack_e4 + 1;
                    uStack_f0 = 500;
                    FUN_00791f0c();
                    piStack_164 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                                   (*(undefined4 *)(iStack_104 + 0x45c));
                    (**(code **)(*piStack_164 + 0x38))(piStack_164,uStack_c4);
                    iStack_e4 = iStack_e4 + -1;
                    FUN_00791d48(&uStack_c4,2);
                    goto LAB_00407ff3;
                  }
                }
                piStack_168 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                               (*(undefined4 *)(iStack_104 + 0x45c));
                piStack_16c = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                               (*(undefined4 *)(iStack_104 + 0x45c));
                iVar5 = (**(code **)(*piStack_16c + 0x14))();
                (**(code **)(*piStack_168 + 0x48))(piStack_168,iVar5 + -1);
                uStack_f0 = 0x200;
                iVar5 = (**(code **)(*piStack_124 + 0x14))();
                iVar9 = (iStack_14c * 100) / iVar5;
                uVar4 = FUN_004021f4(auStack_cc,(iStack_14c * 100) % iVar5);
                iStack_e4 = iStack_e4 + 1;
                FUN_006ed370(iVar9,uVar4);
                puVar11 = auStack_cc;
                uVar4 = FUN_004021f4(&uStack_d4);
                iStack_e4 = iStack_e4 + 1;
                FUN_00791bac(auStack_d0,0x7a7974);
                iStack_e4 = iStack_e4 + 1;
                FUN_00791da0(puVar11,auStack_d0,uVar4);
                uVar4 = uStack_d4;
                uVar7 = _Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(iStack_104 + 0x45c));
                func_0x006da008(uVar7,uVar4);
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(&uStack_d4,2);
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(auStack_d0,2);
                iStack_e4 = iStack_e4 + -1;
                FUN_00791d48(auStack_cc,2);
                FUN_007534e4(*(undefined4 *)(iStack_104 + 0x45c));
                iStack_14c = iStack_14c + 1;
              }
              uVar10 = extraout_var;
              if (cStack_10b == '\x01') {
                DAT_007c52ac = 4;
                DAT_007c52ad = 0x90;
                DAT_007c52ae = 1;
                uVar6 = _Jvhidcontrollerclass_TJvHidDevice_WriteFile_qqrpvuirui
                                  (DAT_007c5184,&DAT_007c52ac,0x40,&DAT_007c52ec);
                DAT_007c52f4 = uVar6 & 0xff;
                bVar1 = _Jvhidcontrollerclass_TJvHidDevice_ReadFile_qqrpvuirui
                                  (DAT_007c5184,&DAT_007c526c,0x40,&DAT_007c52ec);
                uVar10 = 0;
                DAT_007c52f4 = (uint)bVar1;
              }
              DAT_007c5230 = 0;
              abStack_1f4[0] = 0xff;
              abStack_1f4[1] = 0x55;
              abStack_1f4[2] = 0xaa;
              FUN_00408220(iStack_104,CONCAT31(uVar10,0x83),abStack_1f4,0x16);
              FUN_004082f0(iStack_104,abStack_1b4,1);
              DAT_007a7246 = '\0';
              DAT_007a7247 = 0;
              DAT_007a7248 = 0;
              DAT_007c5234 = 0;
              FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),1);
              piStack_170 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                             (*(undefined4 *)(iStack_104 + 0x45c));
              uStack_f0 = 0x20c;
              puVar3 = (undefined4 *)FUN_00791bac(auStack_d8,s_Success_Update__007a7976);
              iStack_e4 = iStack_e4 + 1;
              (**(code **)(*piStack_170 + 0x38))(piStack_170,*puVar3);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_d8,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(&uStack_10,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_c,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_8,2);
              *in_FS_OFFSET = uStack_100;
            }
            else {
              func_0x00408810(iStack_104);
              FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),1);
              piStack_138 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv
                                             (*(undefined4 *)(iStack_104 + 0x45c));
              uStack_f0 = 0x104;
              puVar3 = (undefined4 *)
                       FUN_00791bac(auStack_6c,s_Error_1030_Firmware_is_incorrect_007a778a);
              iStack_e4 = iStack_e4 + 1;
              (**(code **)(*piStack_138 + 0x38))(piStack_138,*puVar3);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_6c,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(&uStack_10,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_c,2);
              iStack_e4 = iStack_e4 + -1;
              FUN_00791d48(auStack_8,2);
              *in_FS_OFFSET = uStack_100;
            }
          }
        }
      }
    }
    else {
      piStack_120 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(iStack_104 + 0x45c));
      uStack_f0 = 0x74;
      puVar3 = (undefined4 *)FUN_00791bac(auStack_28,s_Boot_Version_ERROR__007a773a);
      iStack_e4 = iStack_e4 + 1;
      (**(code **)(*piStack_120 + 0x38))(piStack_120,*puVar3);
      iStack_e4 = iStack_e4 + -1;
      FUN_00791d48(auStack_28,2);
      DAT_007c51e8 = 0;
      func_0x00408810(iStack_104);
      FUN_00746930(*(undefined4 *)(iStack_104 + 0x2f0),1);
      iStack_e4 = iStack_e4 + -1;
      FUN_00791d48(&uStack_10,2);
      iStack_e4 = iStack_e4 + -1;
      FUN_00791d48(auStack_c,2);
      iStack_e4 = iStack_e4 + -1;
      FUN_00791d48(auStack_8,2);
      *in_FS_OFFSET = uStack_100;
    }
  }
  return;
}

