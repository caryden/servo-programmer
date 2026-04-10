
void _Ilabel_TiLabel_SetCaption_qqrx17System_WideString
               (int param_1,undefined4 param_2,undefined4 param_3)

{
  undefined1 in_ZF;
  undefined4 local_c;
  
                    /* 0xdc230  3352  @Ilabel@TiLabel@SetCaption$qqrx17System@WideString */
  local_c = param_3;
  FUN_00702714(*(undefined4 *)(param_1 + 0x308),param_2);
  if (!(bool)in_ZF) {
    local_c = CONCAT31(local_c._1_3_,1);
    if (*(short *)(param_1 + 0x262) != 0) {
      (**(code **)(param_1 + 0x260))(*(undefined4 *)(param_1 + 0x264),param_1,"Caption",&local_c);
    }
    if ((char)local_c != '\0') {
      FUN_0070244c(param_1 + 0x308,param_2);
      _Ilabel_TiLabel_DoAutoSize_qqrv(param_1);
      _Icomponent_TiComponent_InvalidateChange_qqrv(param_1);
    }
  }
  return;
}

