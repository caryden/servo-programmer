
void _TXAes_SetKeyLen_qqri(int param_1,int param_2)

{
                    /* 0xc4930  3040  @TXAes@SetKeyLen$qqri */
  if (((param_2 != 0x10) && (param_2 != 0x18)) && (param_2 != 0x20)) {
    MessageBoxA((HWND)0x0,&DAT_007af8bf,s_Error_007af8d8,0);
    return;
  }
  *(int *)(param_1 + 0x30) = param_2;
  return;
}

