import React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import { observersComponentBuilderMap } from '../../../extensions/observersComponentBuilderMap';
import { observersTitleBuilderMap } from '../../../extensions/observersTitleBuilderMap';
import { ObserversParams } from '../../../types/ObserversParams';
import { observersList } from '../../../extensions/observersList';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import CreateIcon from '@mui/icons-material/Create';
import MuiAccordionSummary, { AccordionSummaryProps } from '@mui/material/AccordionSummary';
import MuiAccordionDetails from '@mui/material/AccordionDetails';
import MuiAccordion, { AccordionProps } from '@mui/material/Accordion';
import { styled } from '@mui/material/styles';
import ArrowForwardIosSharpIcon from '@mui/icons-material/ArrowForwardIosSharp';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';

const AccordionDetails = styled(MuiAccordionDetails)(({ theme }) => ({
  padding: theme.spacing(2),
  borderTop: '1px solid rgba(0, 0, 0, .125)',
}));

const Accordion = styled((props: AccordionProps) => <MuiAccordion disableGutters elevation={0} square {...props} />)(
  ({ theme }) => ({
    border: `1px solid ${theme.palette.divider}`,
    '&:not(:last-child)': {
      borderBottom: 0,
    },
    '&::before': {
      display: 'none',
    },
  })
);

const AccordionSummary = styled((props: AccordionSummaryProps) => (
  <MuiAccordionSummary expandIcon={<ArrowForwardIosSharpIcon sx={{ fontSize: '0.9rem' }} />} {...props} />
))(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, .05)' : 'rgba(0, 0, 0, .03)',
  flexDirection: 'row-reverse',
  '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
    transform: 'rotate(90deg)',
  },
  '& .MuiAccordionSummary-content': {
    marginLeft: theme.spacing(1),
  },
}));

export const Observers = ({ observables, add, remove, update, save, translate }: ObserversParams) => {
  const actions = [
    {
      icon: <SaveIcon />,
      name: 'Save',
      onClick: () => {
        save(observables);
      },
    },
    {
      icon: <AddIcon />,
      name: 'New Observer',
      onClick: () => {
        add({ type: '' });
      },
    },
  ];
  const getComponent = (observable: any, index: number, updateFieldWithValue: any): any => {
    try {
      return observersComponentBuilderMap[observable.type](observable, index, updateFieldWithValue, translate);
    } catch (_) {
      return <></>;
    }
  };
  const getTitle = (observable: any): string => {
    try {
      return observersTitleBuilderMap[observable.type](observable);
    } catch (_) {
      return translate('Unkown');
    }
  };
  return (
    <>
      {observables.map((observable: any, index: number) => (
        <Accordion key={`observable-accordion-${index}`}>
          <AccordionSummary aria-controls="panel1a-content" id="panel1a-header">
            <Typography>{getTitle(observable)}</Typography>
            <IconButton
              onClick={() => remove(index)}
              size="small"
              sx={{ marginLeft: 'auto', marginRight: 0, padding: '0.15rem' }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Select
                value={observable.type}
                label="Observer Type"
                variant="standard"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => update('type', index, event.target.value)}
              >
                {observersList.map(({ value, label }: any) => (
                  <MenuItem value={value}>{label}</MenuItem>
                ))}
              </Select>
              {getComponent(observable, index, update)}
              <TextField
                label={translate('Alias')}
                variant="standard"
                value={observable.alias}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => update('alias', index, event.target.value)}
              />
              <TextField
                label={translate('Issue Creation Endpoint')}
                variant="standard"
                value={observable.issueEndpoint}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  update('issueEndpoint', index, event.target.value)
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={observable.muted}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      update('muted', index, event.target.checked)
                    }
                  />
                }
                label={translate('Muted')}
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
      <SpeedDial
        sx={{
          margin: 0,
          top: 'auto',
          right: 20,
          bottom: 20,
          left: 'auto',
          position: 'fixed',
        }}
        color="secondary"
        ariaLabel="SpeedDial openIcon example"
        icon={<SpeedDialIcon openIcon={<CreateIcon />} />}
      >
        {actions.map((action) => (
          <SpeedDialAction key={action.name} icon={action.icon} tooltipTitle={action.name} onClick={action.onClick} />
        ))}
      </SpeedDial>
    </>
  );
};
