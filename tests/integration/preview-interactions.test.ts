// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { Preview } from '../../src/ui/Preview';
import { reconcilePreviewState } from '../../src/integration/session';
import type { UiSpec } from '../../src/contracts';
const spec:UiSpec={sessionId:'preview-test',version:1,basedOnBriefVersion:1,templateId:'studio-booking',templateVersion:1,demoDataLabel:'Synthetic demo',demoData:{items:[{name:'Selected room',category:'Featured'},{name:'Other room',category:'Community'}]},screens:[{id:'home',title:'Studio',components:[{id:'results',type:'table',properties:{columns:['name','category'],dataKey:'items'},actions:[]}]}]};
afterEach(cleanup);
describe('preview interaction state parity',()=>{
 it('applies the category filter supplied by the same state/action contract as export',()=>{const state=reconcilePreviewState(null,spec);state.filters.items={field:'category',stateKey:'category'};state.values.category='Featured';render(createElement(Preview,{spec,state,onAction:vi.fn(),onFieldChange:vi.fn()}));expect(screen.getByText('Selected room')).toBeTruthy();expect(screen.queryByText('Other room')).toBeNull();});
 it('searches the currently displayed dataset and reports zero results',()=>{render(createElement(Preview,{spec,state:reconcilePreviewState(null,spec),onAction:vi.fn(),onFieldChange:vi.fn()}));fireEvent.change(screen.getByRole('textbox',{name:'Search demo items'}),{target:{value:'does-not-exist'}});expect(screen.queryByText('Selected room')).toBeNull();expect(screen.getByText(/No matching demo items/)).toBeTruthy();});
});
