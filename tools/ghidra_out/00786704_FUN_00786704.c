
undefined4 * FUN_00786704(void)

{
  undefined4 *puVar1;
  undefined4 uVar2;
  undefined2 uVar3;
  byte bVar4;
  undefined4 *puVar5;
  undefined4 *in_stack_00000004;
  undefined1 in_stack_00000008;
  uint in_stack_0000000c;
  
  uVar3 = CONCAT11(in_stack_00000008,in_stack_00000008);
  if ((in_stack_0000000c & 0xfffffffc) == 0) {
    if ((in_stack_0000000c & 3) != 0) {
      *(undefined1 *)in_stack_00000004 = in_stack_00000008;
      bVar4 = (char)(in_stack_0000000c & 3) - 1;
      if (bVar4 != 0) {
        *(undefined2 *)((int)in_stack_00000004 + (bVar4 - 1)) = uVar3;
      }
    }
    return in_stack_00000004;
  }
  *(undefined2 *)in_stack_00000004 = uVar3;
  puVar1 = (undefined4 *)((int)in_stack_00000004 + (in_stack_0000000c - 4));
  *(undefined2 *)((int)in_stack_00000004 + 2) = uVar3;
  uVar2 = *in_stack_00000004;
  in_stack_0000000c = in_stack_0000000c >> 3;
  puVar5 = in_stack_00000004;
  if (in_stack_0000000c == 0) {
    *puVar1 = uVar2;
    return in_stack_00000004;
  }
  do {
    *puVar5 = uVar2;
    puVar5[1] = uVar2;
    if (in_stack_0000000c == 1) break;
    puVar5[2] = uVar2;
    puVar5[3] = uVar2;
    if (in_stack_0000000c == 2) break;
    puVar5[4] = uVar2;
    puVar5[5] = uVar2;
    if (in_stack_0000000c == 3) break;
    puVar5[6] = uVar2;
    puVar5[7] = uVar2;
    if (in_stack_0000000c == 4) break;
    puVar5[8] = uVar2;
    puVar5[9] = uVar2;
    if (in_stack_0000000c == 5) break;
    puVar5[10] = uVar2;
    puVar5[0xb] = uVar2;
    puVar5 = puVar5 + 0xc;
    in_stack_0000000c = in_stack_0000000c - 6;
  } while (in_stack_0000000c != 0);
  *puVar1 = uVar2;
  puVar1[-1] = uVar2;
  return in_stack_00000004;
}

