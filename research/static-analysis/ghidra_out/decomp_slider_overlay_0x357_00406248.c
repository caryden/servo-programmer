
void FUN_00406248(int param_1,int param_2)

{
  char cVar1;
  
  cVar1 = (**(code **)(**(int **)(param_1 + 0x3e0) + 0x120))();
  if (cVar1 == '\0') {
    if ((*(byte *)(param_2 + 0x25) & 2) == 2) {
      *(byte *)(param_2 + 0x25) = *(byte *)(param_2 + 0x25) & 0xfd;
      if ((*(byte *)(param_2 + 0x25) & 1) == 1) {
        *(byte *)(param_2 + 0x25) = *(byte *)(param_2 + 0x25) & 0xfe;
      }
      else {
        *(byte *)(param_2 + 0x25) = *(byte *)(param_2 + 0x25) | 1;
      }
    }
  }
  else if ((*(byte *)(param_2 + 0x25) & 2) != 2) {
    *(byte *)(param_2 + 0x25) = *(byte *)(param_2 + 0x25) | 2;
    if ((*(byte *)(param_2 + 0x25) & 1) == 1) {
      *(byte *)(param_2 + 0x25) = *(byte *)(param_2 + 0x25) & 0xfe;
    }
    else {
      *(byte *)(param_2 + 0x25) = *(byte *)(param_2 + 0x25) | 1;
    }
  }
  *(undefined1 *)(param_2 + 0x12) = *(undefined1 *)(*(int *)(param_1 + 0x3e4) + 0x220);
  *(undefined1 *)(param_2 + 0x36) = *(undefined1 *)(*(int *)(param_1 + 0x3dc) + 0x220);
  return;
}

