export const dragdrop = (setIsDrag: any, parseDataransfer: any) => {
  return {
    onDragEnter: (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDrag(true);
    },
    onDragLeave: (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      const nextTarget = e.relatedTarget as Node | null;
      if (!nextTarget || !e.currentTarget.contains(nextTarget)) {
        setIsDrag(false);
      }
    },
    onDragOver: (e: any) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDrag(false);
      parseDataransfer(e.dataTransfer);
    },
  };
};
