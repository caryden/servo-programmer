
void FUN_0040330c(int param_1,undefined4 param_2)

{
  char cVar1;
  uint uVar2;
  undefined4 *puVar3;
  undefined4 uVar4;
  undefined4 *in_FS_OFFSET;
  undefined1 local_17c;
  char local_17b;
  char local_17a;
  char local_177;
  char local_175;
  byte local_14b;
  byte local_14a;
  char acStack_13c [64];
  undefined1 local_fc;
  undefined1 local_fb;
  undefined1 local_f8;
  int *local_7c;
  int local_78;
  int local_74;
  int local_70;
  int local_6c;
  int *local_68;
  undefined4 local_64;
  char local_60 [8];
  undefined1 local_58;
  undefined4 local_54;
  int local_50;
  undefined4 local_4c;
  undefined2 local_3c;
  int local_30;
  undefined1 local_28 [4];
  undefined4 local_24;
  undefined4 local_20;
  undefined4 local_1c;
  undefined4 local_18;
  undefined4 local_14;
  undefined4 local_10;
  undefined1 local_c [4];
  undefined1 local_8 [4];
  
  local_54 = param_2;
  local_50 = param_1;
  FUN_00786a58(&DAT_007a7ef4);
  local_64 = 0;
  local_3c = 8;
  FUN_004021f4(local_8);
  local_30 = local_30 + 1;
  local_3c = 0x14;
  if (DAT_007c5231 != '\0') {
    DAT_007a7246 = 1;
    FUN_00786704();
    local_fc = 4;
    local_fb = 0x8a;
    local_f8 = 4;
    uVar2 = _Jvhidcontrollerclass_TJvHidDevice_WriteFile_qqrpvuirui
                      (DAT_007c5184,&local_fc,0x40,&DAT_007c52ec);
    DAT_007c52f4 = uVar2 & 0xff;
    if (DAT_007c52f4 == 0) {
      local_30 = local_30 + -1;
      FUN_00791d48(local_8,2);
      *in_FS_OFFSET = local_4c;
      return;
    }
    uVar2 = _Jvhidcontrollerclass_TJvHidDevice_ReadFile_qqrpvuirui
                      (DAT_007c5184,&local_17c,0x40,&DAT_007c52ec);
    DAT_007c52f4 = uVar2 & 0xff;
    if (DAT_007c52f4 == 0) {
      local_30 = local_30 + -1;
      FUN_00791d48(local_8,2);
      *in_FS_OFFSET = local_4c;
      return;
    }
    if ((local_17b == '\x01') && (local_17a == '\0')) {
      if ((local_177 == '\x03') && (local_175 == '\x01')) {
        DAT_007a7247 = '\x01';
        DAT_007c5234 = 0x352;
        local_64 = 0x5f;
        _Cxpc_TcxPageControl_SetActivePage_qqrp16Cxpc_TcxTabSheet
                  (*(undefined4 *)(local_50 + 0x324),*(undefined4 *)(local_50 + 0x328));
      }
      else if ((local_177 == '\x04') && (local_175 == '\x01')) {
        DAT_007c5234 = 0x357;
        local_64 = 0x5f;
        DAT_007a7247 = '\x01';
        _Cxpc_TcxPageControl_SetActivePage_qqrp16Cxpc_TcxTabSheet
                  (*(undefined4 *)(local_50 + 0x324),*(undefined4 *)(local_50 + 0x3cc));
      }
      else {
        DAT_007a7247 = '\0';
        DAT_007c5234 = 0;
        _Cxpc_TcxPageControl_SetActivePage_qqrp16Cxpc_TcxTabSheet
                  (*(undefined4 *)(local_50 + 0x324),*(undefined4 *)(local_50 + 0x328));
      }
    }
    else {
      DAT_007a7247 = '\0';
    }
    if ((DAT_007a7248 == '\0') && (DAT_007a7247 == '\x01')) {
      if (local_175 == '\x01') {
        DAT_007a7249 = 1;
        Sleep(0x19);
        local_68 = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_50 + 0x45c));
        local_3c = 0x20;
        puVar3 = (undefined4 *)FUN_00791bac(local_c,s_Servo_plug_in__007a7404);
        local_30 = local_30 + 1;
        (**(code **)(*local_68 + 0x38))(local_68,*puVar3);
        local_30 = local_30 + -1;
        FUN_00791d48(local_c,2);
        FUN_00791f0c();
        if (DAT_007c5234 == 0x352) {
          local_3c = 0x2c;
          uVar4 = FUN_004021f4(&local_10);
          local_30 = local_30 + 1;
          FUN_00792194(s_Firmware__007a7421,local_8,uVar4);
          FUN_00752fd8(*(undefined4 *)(local_50 + 0x3a8),local_10);
          local_30 = local_30 + -1;
          FUN_00791d48(&local_10,2);
          FUN_00786704();
          cVar1 = FUN_004047d0(local_50,0xcd,0,&local_17c,0x5f);
          if (cVar1 != '\0') {
            local_6c = 0;
            do {
              local_60[local_6c] = acStack_13c[local_6c];
              local_6c = local_6c + 1;
            } while (local_6c < 8);
            local_70 = 0;
            local_3c = 0x14;
            do {
              if (local_60[local_70] == '*') {
                local_60[local_70] = ' ';
              }
              local_70 = local_70 + 1;
            } while (local_70 < 8);
            local_58 = 0;
            FUN_00791f0c();
            FUN_00791d78(&DAT_007c51ec,local_8);
            local_3c = 0x38;
            uVar4 = FUN_004021f4(&local_14);
            local_30 = local_30 + 1;
            FUN_00792194(s_Servo_Name__007a742f,local_8,uVar4);
            FUN_00752fd8(*(undefined4 *)(local_50 + 0x3a0),local_14);
            local_30 = local_30 + -1;
            FUN_00791d48(&local_14,2);
            FUN_00791f0c();
            if (local_14a < 0x14) {
              _Vg_scene_TvgVisualObject_SetEnabled_qqrxo(*(undefined4 *)(local_50 + 0x4b8),0);
            }
            else if ((local_14a == 0x14) && (local_14b < 5)) {
              _Vg_scene_TvgVisualObject_SetEnabled_qqrxo(*(undefined4 *)(local_50 + 0x4b8),0);
            }
            else {
              _Vg_scene_TvgVisualObject_SetEnabled_qqrxo(*(undefined4 *)(local_50 + 0x4b8),1);
            }
            local_3c = 0x44;
            uVar4 = FUN_004021f4(&local_18);
            local_30 = local_30 + 1;
            FUN_00792194(s_Manufacture__007a7445,local_8,uVar4);
            FUN_00752fd8(*(undefined4 *)(local_50 + 0x3a4),local_18);
            local_30 = local_30 + -1;
            FUN_00791d48(&local_18,2);
            FUN_00404b28(local_50,&local_17c);
          }
        }
        else if (DAT_007c5234 == 0x357) {
          local_3c = 0x50;
          uVar4 = FUN_004021f4(&local_1c);
          local_30 = local_30 + 1;
          FUN_00792194(s_Firmware__007a7453,local_8,uVar4);
          FUN_00752fd8(*(undefined4 *)(local_50 + 0x3f4),local_1c);
          local_30 = local_30 + -1;
          FUN_00791d48(&local_1c,2);
          FUN_00786704();
          cVar1 = FUN_004047d0(local_50,0xcd,0,&local_17c,0x5f);
          if (cVar1 != '\0') {
            local_74 = 0;
            do {
              local_60[local_74] = acStack_13c[local_74];
              local_74 = local_74 + 1;
            } while (local_74 < 8);
            local_78 = 0;
            local_3c = 0x14;
            do {
              if (local_60[local_78] == '*') {
                local_60[local_78] = ' ';
              }
              local_78 = local_78 + 1;
            } while (local_78 < 8);
            local_58 = 0;
            FUN_00791f0c();
            FUN_00791d78(&DAT_007c51ec,local_8);
            local_3c = 0x5c;
            uVar4 = FUN_004021f4(&local_20);
            local_30 = local_30 + 1;
            FUN_00792194(s_Servo_Name__007a7461,local_8,uVar4);
            FUN_00752fd8(*(undefined4 *)(local_50 + 0x3ec),local_20);
            local_30 = local_30 + -1;
            FUN_00791d48(&local_20,2);
            FUN_00791f0c();
            local_3c = 0x68;
            uVar4 = FUN_004021f4(&local_24);
            local_30 = local_30 + 1;
            FUN_00792194(s_Manufacture__007a7477,local_8,uVar4);
            FUN_00752fd8(*(undefined4 *)(local_50 + 0x3f0),local_24);
            local_30 = local_30 + -1;
            FUN_00791d48(&local_24,2);
            _Vg_scene_TvgVisualObject_SetEnabled_qqrxo(*(undefined4 *)(local_50 + 0x4b8),0);
            FUN_004054a0(local_50,&local_17c);
          }
        }
      }
      else {
        DAT_007a7249 = 0;
      }
    }
    if ((DAT_007a7248 == '\x01') && (DAT_007a7247 == '\0')) {
      local_7c = (int *)_Cxmemo_TcxCustomMemo_GetLines_qqrv(*(undefined4 *)(local_50 + 0x45c));
      local_3c = 0x74;
      puVar3 = (undefined4 *)FUN_00791bac(local_28,s_Servo_remove__007a7485);
      local_30 = local_30 + 1;
      (**(code **)(*local_7c + 0x38))(local_7c,*puVar3);
      local_30 = local_30 + -1;
      FUN_00791d48(local_28,2);
    }
    DAT_007a7248 = DAT_007a7247;
  }
  DAT_007a7246 = 0;
  local_30 = local_30 + -1;
  FUN_00791d48(local_8,2);
  *in_FS_OFFSET = local_4c;
  return;
}

