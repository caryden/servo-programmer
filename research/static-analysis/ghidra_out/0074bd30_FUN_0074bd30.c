
void FUN_0074bd30(int param_1,undefined4 param_2)

{
  HWND hWnd;
  UINT Msg;
  WPARAM wParam;
  undefined1 *lParam;
  undefined1 auStack_110 [264];
  
  lParam = auStack_110;
  if ((*PTR_DAT_007c4cd4 == '\0') || (*(int *)(param_1 + 0x3c) == 0)) {
    FUN_00701d38(param_2,*(undefined4 *)(param_1 + 0x78));
  }
  else {
    wParam = 0x105;
    Msg = 0x465;
    hWnd = GetParent(*(HWND *)(param_1 + 0x3c));
    SendMessageA(hWnd,Msg,wParam,(LPARAM)lParam);
    FUN_006ee098(auStack_110,param_2);
  }
  return;
}

