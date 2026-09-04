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
      setIsDrag(false);
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
