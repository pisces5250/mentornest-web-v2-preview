import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {diagnoseScienceResponse,analyzeExperiment,interpretChartTable,interpretDiagram,scienceSpecialistDecide,emitEvidence} from '../dist/lib/science_specialist.mjs';

const WORKSPACE = '/home/node/.openclaw/workspace';
const TEST_STUDENT = 'student_t_sci';
const EVIDENCE_FILE = path.join(WORKSPACE, 'data/mastery-evidence', `${TEST_STUDENT}.jsonl`);
const MASTERY_FILE = path.join(WORKSPACE, 'data/mastery', `${TEST_STUDENT}.json`);

const base={stem:'水的狀態',student_answer:'液體',expected_answer:'液體',knowledge_point:'science.G4.MATTER.state-change',student_id:'student_t_sci'};
test('correct diagnosis',()=>{const r=diagnoseScienceResponse(base);assert.equal(r.valid,true);assert.equal(r.correct,true);assert.equal(r.hint_level,0);});
test('wrong diagnosis evidence',()=>{const r=diagnoseScienceResponse({...base,student_answer:'固體'});assert.equal(r.correct,false);assert.ok(r.error_codes.length);});
test('empty answer invalid',()=>{const r=diagnoseScienceResponse({...base,student_answer:''});assert.equal(r.valid,true);assert.equal(r.correct,false);});
test('experiment identifies missing variables',()=>{const r=analyzeExperiment({variables:{},expected_design:{independent:'水量',dependent:'高度',controlled:'光照'},student_design:'改變水量'});assert.equal(r.correct,false);assert.ok(r.missing_variables.length);});
test('experiment complete correct',()=>{const r=analyzeExperiment({variables:{independent:'水量',dependent:'高度',controlled:'光照'},expected_design:{independent:'水量',dependent:'高度',controlled:'光照'},student_design:'公平測試'});assert.equal(r.correct,true);});
test('chart correct',()=>{const r=interpretChartTable({student_answer:'增加',expected_answer:'增加'});assert.equal(r.correct,true);assert.equal(r.reasoning_steps.length,3);});
test('chart error hint',()=>{assert.match(interpretChartTable({student_answer:'減少',expected_answer:'增加'}).hint_text_zh,/軸線/);});
test('diagram matching',()=>{const r=interpretDiagram({diagram_descriptor:{},question:'標示',student_answer:'蒸發凝結',expected_answer:['蒸發','凝結']});assert.equal(r.correct,true);assert.equal(r.missed_elements.length,0);});
test('decision experiment',()=>assert.equal(scienceSpecialistDecide({knowledge_point:'science.G3.PROC.measure-basic',attempts:1}).action,'experiment_simulation'));
test('decision chart drilling',()=>assert.equal(scienceSpecialistDecide({knowledge_point:'science.G6.EARTH.weather',attempts:1}).action,'chart_drilling'));
test('evidence isolation and no mastery field',()=>{const r=emitEvidence({student_id:'student_t_sci',error_codes:['SCI-DATA-AXIS']});assert.equal(r.student_id,'student_t_sci');assert.equal('mastery' in r,false);});

test.after(async () => {
  await fs.unlink(EVIDENCE_FILE).catch(() => {});
  await fs.unlink(MASTERY_FILE).catch(() => {});
  await fs.rm(path.join(WORKSPACE, 'data/curriculum-progress', `${TEST_STUDENT}.jsonl`), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(WORKSPACE, 'data/mastery-backfill', TEST_STUDENT), { recursive: true, force: true }).catch(() => {});
});