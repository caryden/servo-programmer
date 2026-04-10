
void FUN_004054a0(int param_1,int param_2)

{
  if ((*(byte *)(param_2 + 0x25) & 2) == 2) {
    (**(code **)(**(int **)(param_1 + 0x3e0) + 0x124))(*(int **)(param_1 + 0x3e0),1);
  }
  else {
    (**(code **)(**(int **)(param_1 + 0x3e0) + 0x124))(*(int **)(param_1 + 0x3e0),0);
  }
  (**(code **)(**(int **)(param_1 + 0x3e4) + 0xf8))
            (*(int **)(param_1 + 0x3e4),*(undefined1 *)(param_2 + 0x12));
  (**(code **)(**(int **)(param_1 + 0x3dc) + 0xf8))
            (*(int **)(param_1 + 0x3dc),*(undefined1 *)(param_2 + 0x36));
  return;
}

