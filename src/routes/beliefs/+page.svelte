<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import BeliefNode from './BeliefNode.svelte';
	import EvidenceNode from './EvidenceNode.svelte';
	import RelationEdge from './RelationEdge.svelte';
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		MarkerType,
		type Node,
		type Edge,
		type NodeTypes,
		type EdgeTypes,
		type Connection
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import dagre from '@dagrejs/dagre';
	import { goto } from '$app/navigation';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let selectedBeliefIndex = $state(0);
	let expandedBeliefId: number | null = $state(null);
	let editingBeliefId: number | null = $state(null);
	let confirmingDeleteId: number | null = $state(null);
	let recordingBeliefId: number | null = $state(null);

	let linkBeliefSelect: Record<number, number | null> = $state({});
	let linkBeliefFlipped: Record<number, boolean> = $state({});
	let linkEvidenceSelect: Record<number, number | null> = $state({});
	let newEvidenceContent: Record<number, string> = $state({});
	let linkHabitSelect: Record<number, number | null> = $state({});
	let intensityValue: Record<number, number> = $state({});
	let intensityNotes: Record<number, string> = $state({});
	let intensityDate: Record<number, string> = $state({});

	let graphView = $state(data.view === 'graph');

	let pendingRelations: Array<{
		source: number;
		target: number;
		type: 'supports' | 'contradicts';
		edgeId: string;
	}> = $state([]);

	let typePicker: {
		edgeId: string;
		sourceId: number;
		targetId: number;
		x: number;
		y: number;
	} | null = $state(null);

	let evidenceTypePicker: {
		evidenceId: number;
		beliefId: number;
		x: number;
		y: number;
	} | null = $state(null);

	let selectedGraphBeliefId: number | null = $state(null);
	let graphShowNewBeliefForm = $state(false);
	let graphNewBeliefContent = $state('');
	let graphNewBeliefValence = $state('');
	let editingGraphNodeId: number | null = $state(null);

	const POSITIONS_KEY = 'semotina:beliefs:node-positions';

	function loadSavedPositions(): Record<string, { x: number; y: number }> {
		if (typeof localStorage === 'undefined') return {};
		try {
			const raw = localStorage.getItem(POSITIONS_KEY);
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	}

	function savePositions(currentNodes: Node[]) {
		if (typeof localStorage === 'undefined') return;
		const positions: Record<string, { x: number; y: number }> = {};
		for (const node of currentNodes) {
			positions[node.id] = { x: node.position.x, y: node.position.y };
		}
		try {
			localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
		} catch {
			// quota exceeded, ignore
		}
	}

	function onStartEditNode(beliefId: number) {
		editingGraphNodeId = beliefId;
	}

	function onCancelEditNode() {
		editingGraphNodeId = null;
	}

	const nodeTypes: NodeTypes = {
		belief: BeliefNode,
		evidence: EvidenceNode
	};

	const edgeTypes: EdgeTypes = {
		relation: RelationEdge
	};

	function handleEdgeDeleteFromLabel(edgeId: string, relationId?: number) {
		if (relationId) {
			deleteRelation(relationId);
		} else {
			pendingRelations = pendingRelations.filter((r) => r.edgeId !== edgeId);
			edges = edges.filter((e) => e.id !== edgeId);
		}
	}

	async function updateBeliefContent(beliefId: number, content: string) {
		const body = new URLSearchParams({ id: String(beliefId), content });
		await fetch('?/updateBelief', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	function buildInitialElements(savedPositions?: Record<string, { x: number; y: number }>): {
		nodes: Node[];
		edges: Edge[];
	} {
		const nodes: Node[] = [];
		const edges: Edge[] = [];
		const positions = savedPositions ?? {};

		for (const belief of data.beliefs) {
			const id = `b-${belief.id}`;
			nodes.push({
				id,
				type: 'belief',
				data: {
					beliefId: belief.id,
					label: belief.content,
					valence: belief.valence ?? 'neutral',
					onUpdate: updateBeliefContent,
					tags: belief.tags,
					editingNodeId: () => editingGraphNodeId,
					onStartEdit: onStartEditNode,
					onCancelEdit: onCancelEditNode
				},
				position: positions[id] ?? { x: 0, y: 0 }
			});
		}

		for (const ev of data.allEvidence) {
			const id = `e-${ev.id}`;
			nodes.push({
				id,
				type: 'evidence',
				data: { label: ev.content },
				position: positions[id] ?? { x: 0, y: 0 }
			});
		}

		for (const rel of data.allRelations) {
			edges.push({
				id: `rel-${rel.id}`,
				source: `b-${rel.sourceBeliefId}`,
				target: `b-${rel.targetBeliefId}`,
				type: 'relation',
				data: {
					type: rel.type,
					relationId: rel.id,
					pending: false,
					onDelete: handleEdgeDeleteFromLabel
				},
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: rel.type === 'supports' ? '#3b82f6' : '#ef4444',
					width: 20,
					height: 20
				}
			});
		}

		for (const link of data.allBeliefEvidence) {
			edges.push({
				id: `ev-${link.id}`,
				source: `e-${link.evidenceId}`,
				target: `b-${link.beliefId}`,
				type: 'relation',
				data: { type: link.type, pending: false, onDelete: handleEdgeDeleteFromLabel },
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: link.type === 'supports' ? '#3b82f6' : '#ef4444',
					width: 20,
					height: 20
				}
			});
		}

		return { nodes, edges };
	}

	function layoutElements(nodesToLayout: Node[], edgesToLayout: Edge[], force = false): Node[] {
		const g = new dagre.graphlib.Graph();
		g.setDefaultEdgeLabel(() => ({}));
		g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });

		const nodeWidth = 260;
		const nodeHeight = 80;

		for (const node of nodesToLayout) {
			g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
		}

		for (const edge of edgesToLayout) {
			g.setEdge(edge.source, edge.target);
		}

		dagre.layout(g);

		return nodesToLayout.map((node) => {
			// If force=false and node already has a real position, keep it
			if (!force && (node.position.x !== 0 || node.position.y !== 0)) {
				return node;
			}
			const pos = g.node(node.id);
			return {
				...node,
				position: {
					x: pos.x - nodeWidth / 2,
					y: pos.y - nodeHeight / 2
				}
			};
		});
	}

	const savedPositions = loadSavedPositions();
	const initial = buildInitialElements(savedPositions);
	const hasSavedPositions = Object.keys(savedPositions).length > 0;
	let nodes = $state.raw<Node[]>(
		hasSavedPositions ? initial.nodes : layoutElements(initial.nodes, initial.edges, true)
	);
	let edges = $state.raw<Edge[]>(initial.edges);

	$effect(() => {
		graphView = data.view === 'graph';
	});

	// Track data identity to skip the initial run (already handled by buildInitialElements above)
	let prevDataRef = data;

	$effect(() => {
		// Read data to register dependency
		const currentData = data;

		// Skip initial run — the initial nodes/edges are already set above
		if (currentData === prevDataRef) return;
		prevDataRef = currentData;

		// Rebuild graph elements when data changes (after invalidateAll)
		// Preserve current node positions instead of re-running dagre
		const currentPositions: Record<string, { x: number; y: number }> = {};
		const currentNodes = untrack(() => nodes);
		for (const node of currentNodes) {
			currentPositions[node.id] = { x: node.position.x, y: node.position.y };
		}

		const rebuilt = buildInitialElements(currentPositions);
		// Only run dagre on genuinely new nodes (those at 0,0 with no saved position)
		const laidOut = layoutElements(rebuilt.nodes, rebuilt.edges);

		// Preserve committed edges and re-add any pending ones (untracked to avoid re-layout on new pending edges)
		const currentPending = untrack(() => pendingRelations);
		const pendingEdges: Edge[] = currentPending.map((r) => ({
			id: r.edgeId,
			source: `b-${r.source}`,
			target: `b-${r.target}`,
			type: 'relation' as const,
			data: { type: r.type, pending: true, onDelete: handleEdgeDeleteFromLabel },
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color: r.type === 'supports' ? '#3b82f6' : '#ef4444',
				width: 20,
				height: 20
			}
		}));

		// Merge nodes to preserve SvelteFlow's internal drag/interaction state:
		// - Update existing nodes in-place (position + data)
		// - Add new nodes, remove deleted ones
		const existingMap = new Map(currentNodes.map((n) => [n.id, n]));

		const mergedNodes: Node[] = [];
		for (const newNode of laidOut) {
			const existing = existingMap.get(newNode.id);
			if (existing) {
				// Preserve the existing node object, update data and position
				mergedNodes.push({
					...existing,
					data: newNode.data,
					position: newNode.position
				});
			} else {
				mergedNodes.push(newNode);
			}
		}

		untrack(() => {
			nodes = mergedNodes;
			edges = [...rebuilt.edges, ...pendingEdges];
			savePositions(mergedNodes);
		});
	});

	function onconnect(connection: Connection) {
		const sourceId = connection.source;
		const targetId = connection.target;

		if (!sourceId || !targetId || sourceId === targetId) return;

		// Evidence → Belief connection
		let evidenceNodeId: string | null = null;
		let beliefNodeId: string | null = null;

		if (sourceId.startsWith('e-') && targetId.startsWith('b-')) {
			evidenceNodeId = sourceId;
			beliefNodeId = targetId;
		} else if (sourceId.startsWith('b-') && targetId.startsWith('e-')) {
			evidenceNodeId = targetId;
			beliefNodeId = sourceId;
		}

		if (evidenceNodeId && beliefNodeId) {
			const evidenceId = parseInt(evidenceNodeId.replace('e-', ''));
			const beliefId = parseInt(beliefNodeId.replace('b-', ''));

			evidenceTypePicker = { evidenceId, beliefId, x: 0, y: 0 };
			const container = document.querySelector('.svelte-flow');
			if (container) {
				const rect = container.getBoundingClientRect();
				evidenceTypePicker.x = rect.width / 2;
				evidenceTypePicker.y = rect.height / 2;
			}
			return;
		}

		// Belief → Belief connection
		if (!sourceId.startsWith('b-') || !targetId.startsWith('b-')) return;

		const edgeId = `pending-${Date.now()}`;
		const sourceBeliefId = parseInt(sourceId.replace('b-', ''));
		const targetBeliefId = parseInt(targetId.replace('b-', ''));

		typePicker = {
			edgeId,
			sourceId: sourceBeliefId,
			targetId: targetBeliefId,
			x: 0,
			y: 0
		};

		const container = document.querySelector('.svelte-flow');
		if (container) {
			const rect = container.getBoundingClientRect();
			typePicker.x = rect.width / 2;
			typePicker.y = rect.height / 2;
		}
	}

	function selectType(type: 'supports' | 'contradicts') {
		if (!typePicker) return;

		const { edgeId, sourceId, targetId } = typePicker;

		pendingRelations = [...pendingRelations, { source: sourceId, target: targetId, type, edgeId }];

		const newEdge: Edge = {
			id: edgeId,
			source: `b-${sourceId}`,
			target: `b-${targetId}`,
			type: 'relation',
			data: { type, pending: true, onDelete: handleEdgeDeleteFromLabel },
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color: type === 'supports' ? '#3b82f6' : '#ef4444',
				width: 20,
				height: 20
			}
		};
		edges = [...edges, newEdge];

		typePicker = null;
	}

	function cancelTypePicker() {
		typePicker = null;
	}

	async function selectEvidenceType(type: 'supports' | 'contradicts') {
		if (!evidenceTypePicker) return;
		const { evidenceId, beliefId } = evidenceTypePicker;
		evidenceTypePicker = null;
		await graphLinkEvidence(beliefId, evidenceId, type);
	}

	function cancelEvidenceTypePicker() {
		evidenceTypePicker = null;
	}

	async function handleBeforeDelete({
		nodes: nodesToDelete,
		edges: edgesToDelete
	}: {
		nodes: Node[];
		edges: Edge[];
	}): Promise<boolean> {
		// For nodes: intercept and show confirmation in side panel
		if (nodesToDelete.length > 0) {
			const beliefNode = nodesToDelete.find((n) => n.id.startsWith('b-'));
			if (beliefNode) {
				const beliefId = parseInt(beliefNode.id.replace('b-', ''));
				openBeliefPanel(beliefId);
				panelConfirmDelete = true;
			}
			return false;
		}
		// For edges: allow deletion (handleEdgesDelete will commit)
		return edgesToDelete.length > 0;
	}

	function handleEdgesDelete(deletedEdges: Edge[]) {
		for (const edge of deletedEdges) {
			const relationId = edge.data?.relationId;
			if (relationId) {
				deleteRelation(Number(relationId));
			} else {
				pendingRelations = pendingRelations.filter((r) => r.edgeId !== edge.id);
			}
		}
	}

	async function deleteRelation(id: number) {
		const body = new URLSearchParams({ id: String(id) });
		await fetch('?/removeRelation', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function saveRelations() {
		for (const rel of pendingRelations) {
			const body = new URLSearchParams({
				sourceBeliefId: String(rel.source),
				targetBeliefId: String(rel.target),
				type: rel.type
			});
			await fetch('?/addRelation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString()
			});
		}
		pendingRelations = [];
		await invalidateAll();
	}

	function handleNodeDragStop() {
		savePositions(nodes);
	}

	function isValidConnection(connection: Connection): boolean {
		const { source, target } = connection;
		if (source === target) return false;
		// belief → belief
		if (source?.startsWith('b-') && target?.startsWith('b-')) return true;
		// evidence → belief
		if (source?.startsWith('e-') && target?.startsWith('b-')) return true;
		// belief → evidence
		if (source?.startsWith('b-') && target?.startsWith('e-')) return true;
		return false;
	}

	function beliefsList() {
		return data.beliefs;
	}

	function unlinkedBeliefs(sourceId: number) {
		return data.beliefs.filter((b) => b.id !== sourceId);
	}

	function unlinkedEvidence(beliefId: number) {
		const linkedIds =
			data.beliefs.find((b) => b.id === beliefId)?.linkedEvidence.map((e) => e.evidenceId) ?? [];
		return data.allEvidence.filter((e) => !linkedIds.includes(e.id));
	}

	function unlinkedHabits(beliefId: number) {
		const linkedIds =
			data.beliefs.find((b) => b.id === beliefId)?.linkedHabits.map((h) => h.habitId) ?? [];
		return data.allHabits.filter((h) => !linkedIds.includes(h.id));
	}

	function latestIntensity(beliefId: number) {
		const intensities = data.beliefs.find((b) => b.id === beliefId)?.intensities ?? [];
		return intensities.length > 0 ? intensities[0].value : null;
	}

	function selectedBeliefContent(beliefId: number): string {
		const selectedId = linkBeliefSelect[beliefId];
		if (!selectedId) return '...';
		const found = data.beliefs.find((b: { id: number }) => b.id === selectedId);
		return found ? found.content : '...';
	}

	function selectedEvidenceContent(beliefId: number): string {
		const selectedId = linkEvidenceSelect[beliefId];
		if (!selectedId) return '...';
		const found = data.allEvidence.find((e: { id: number }) => e.id === selectedId);
		return found ? found.content : '...';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (graphView) return;
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const beliefs = beliefsList();

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedBeliefIndex = Math.min(selectedBeliefIndex + 1, beliefs.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedBeliefIndex = Math.max(selectedBeliefIndex - 1, 0);
				break;
			case 'n':
				e.preventDefault();
				showForm = true;
				editingBeliefId = null;
				confirmingDeleteId = null;
				tick().then(() => {
					const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
					ta?.focus();
				});
				break;
			case 'Enter':
				e.preventDefault();
				if (beliefs.length > 0) {
					const belief = beliefs[selectedBeliefIndex];
					expandedBeliefId = expandedBeliefId === belief.id ? null : belief.id;
				}
				break;
			case 'e':
				e.preventDefault();
				if (beliefs.length > 0) {
					const belief = beliefs[selectedBeliefIndex];
					expandedBeliefId = belief.id;
					editingBeliefId = belief.id;
					tick().then(() => {
						const ta = document.querySelector<HTMLTextAreaElement>('.edit-belief-textarea');
						ta?.focus();
					});
				}
				break;
			case 'Escape':
				e.preventDefault();
				showForm = false;
				expandedBeliefId = null;
				editingBeliefId = null;
				confirmingDeleteId = null;
				break;
		}
	}

	function initIntensityForm(beliefId: number) {
		if (!(beliefId in intensityValue)) {
			intensityValue[beliefId] = 5;
			intensityNotes[beliefId] = '';
			intensityDate[beliefId] = data.today;
		}
	}

	function getIntensityBarHeight(value: number): string {
		return `${Math.round((value / 10) * 40)}px`;
	}

	async function graphCreateBelief() {
		if (!graphNewBeliefContent.trim()) return;
		const body = new URLSearchParams({
			content: graphNewBeliefContent.trim(),
			valence: graphNewBeliefValence
		});
		await fetch('?/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		graphNewBeliefContent = '';
		graphNewBeliefValence = '';
		graphShowNewBeliefForm = false;
		await invalidateAll();
	}

	async function graphDeleteBelief(beliefId: number) {
		const body = new URLSearchParams({ id: String(beliefId) });
		await fetch('?/delete', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		selectedGraphBeliefId = null;
		await invalidateAll();
	}

	async function graphUpdateBelief(beliefId: number, content: string, valence: string) {
		const body = new URLSearchParams({ id: String(beliefId), content, valence });
		await fetch('?/update', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphAddRelation(sourceId: number, targetId: number, type: string) {
		const body = new URLSearchParams({
			sourceBeliefId: String(sourceId),
			targetBeliefId: String(targetId),
			type
		});
		await fetch('?/addRelation', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphRemoveRelation(relationId: number) {
		const body = new URLSearchParams({ id: String(relationId) });
		await fetch('?/removeRelation', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphCreateEvidence(beliefId: number, content: string, type: string) {
		const body = new URLSearchParams({ beliefId: String(beliefId), content, type });
		await fetch('?/createEvidence', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphLinkEvidence(beliefId: number, evidenceId: number, type: string) {
		const body = new URLSearchParams({
			beliefId: String(beliefId),
			evidenceId: String(evidenceId),
			type
		});
		await fetch('?/linkEvidence', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphUnlinkEvidence(linkId: number) {
		const body = new URLSearchParams({ id: String(linkId) });
		await fetch('?/unlinkEvidence', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphDeleteEvidence(evidenceId: number) {
		const body = new URLSearchParams({ id: String(evidenceId) });
		await fetch('?/deleteEvidence', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphLogIntensity(beliefId: number, value: number, date: string, notes: string) {
		const body = new URLSearchParams({
			beliefId: String(beliefId),
			value: String(value),
			date,
			notes
		});
		await fetch('?/logIntensity', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphLinkHabit(beliefId: number, habitId: number) {
		const body = new URLSearchParams({ beliefId: String(beliefId), habitId: String(habitId) });
		await fetch('?/linkHabit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphUnlinkHabit(linkId: number) {
		const body = new URLSearchParams({ id: String(linkId) });
		await fetch('?/unlinkHabit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphAddTag(beliefId: number, tagName: string) {
		const body = new URLSearchParams({ beliefId: String(beliefId), tags: tagName });
		await fetch('?/addBeliefTag', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	async function graphRemoveTag(linkId: number) {
		const body = new URLSearchParams({ id: String(linkId) });
		await fetch('?/removeBeliefTag', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		await invalidateAll();
	}

	function toggleView() {
		if (graphView) {
			goto('/beliefs', { replaceState: true });
		} else {
			goto('?view=graph', { replaceState: true });
		}
	}

	function handleGraphKeydown(e: KeyboardEvent) {
		if (!graphView) return;
		if (e.key === 'Escape') {
			editingGraphNodeId = null;
			selectedGraphBeliefId = null;
			graphShowNewBeliefForm = false;
			panelConfirmDelete = false;
		}
	}

	let panelLinkBeliefSelect: number | null = $state(null);
	let panelLinkBeliefType: string = $state('supports');
	let panelLinkEvidenceSelect: number | null = $state(null);
	let panelLinkEvidenceType: string = $state('supports');
	let panelNewEvidenceContent: string = $state('');
	let panelLinkHabitSelect: number | null = $state(null);
	let panelIntensityValue: number = $state(5);
	let panelIntensityNotes: string = $state('');
	let panelIntensityDate: string = $state('');
	let panelNewTagName: string = $state('');
	let panelEditContent: string = $state('');
	let panelEditValence: string = $state('');
	let panelConfirmDelete: boolean = $state(false);

	function openBeliefPanel(beliefId: number) {
		editingGraphNodeId = null;
		selectedGraphBeliefId = beliefId;
		panelConfirmDelete = false;
		const belief = data.beliefs.find((b) => b.id === beliefId);
		if (belief) {
			panelEditContent = belief.content;
			panelEditValence = belief.valence ?? '';
			panelIntensityDate = data.today;
		}
	}

	async function saveBeliefEdits() {
		if (!selectedGraphBeliefId) return;
		await graphUpdateBelief(selectedGraphBeliefId, panelEditContent, panelEditValence);
	}

	async function submitPanelRelation() {
		if (!selectedGraphBeliefId || !panelLinkBeliefSelect) return;
		await graphAddRelation(selectedGraphBeliefId, panelLinkBeliefSelect, panelLinkBeliefType);
		panelLinkBeliefSelect = null;
	}

	async function submitPanelEvidence() {
		if (!selectedGraphBeliefId || !panelNewEvidenceContent.trim()) return;
		await graphCreateEvidence(
			selectedGraphBeliefId,
			panelNewEvidenceContent.trim(),
			panelLinkEvidenceType
		);
		panelNewEvidenceContent = '';
	}

	async function submitPanelLinkEvidence() {
		if (!selectedGraphBeliefId || !panelLinkEvidenceSelect) return;
		await graphLinkEvidence(selectedGraphBeliefId, panelLinkEvidenceSelect, panelLinkEvidenceType);
		panelLinkEvidenceSelect = null;
	}

	async function submitPanelHabit() {
		if (!selectedGraphBeliefId || !panelLinkHabitSelect) return;
		await graphLinkHabit(selectedGraphBeliefId, panelLinkHabitSelect);
		panelLinkHabitSelect = null;
	}

	async function submitPanelIntensity() {
		if (!selectedGraphBeliefId) return;
		await graphLogIntensity(
			selectedGraphBeliefId,
			panelIntensityValue,
			panelIntensityDate,
			panelIntensityNotes
		);
		panelIntensityNotes = '';
		panelIntensityValue = 5;
	}

	async function submitPanelTag() {
		if (!selectedGraphBeliefId || !panelNewTagName.trim()) return;
		await graphAddTag(selectedGraphBeliefId, panelNewTagName.trim());
		panelNewTagName = '';
	}
</script>

<svelte:window
	onkeydown={(e) => {
		handleKeydown(e);
		handleGraphKeydown(e);
	}}
/>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Beliefs</h1>
		<div class="flex items-center gap-2">
			{#if !graphView}
				<button
					onclick={() => {
						showForm = !showForm;
						editingBeliefId = null;
						confirmingDeleteId = null;
					}}
					class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
				>
					{showForm ? 'Cancel' : 'New Belief'}
				</button>
			{/if}
			<div class="flex">
				<button
					onclick={toggleView}
					class="px-3 py-1 text-sm {graphView
						? 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50'
						: 'bg-gray-900 px-3 py-1 text-sm font-medium text-white hover:bg-gray-800'}"
				>
					List
				</button>
				<button
					onclick={toggleView}
					class="px-3 py-1 text-sm {!graphView
						? 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50'
						: 'bg-gray-900 px-3 py-1 text-sm font-medium text-white hover:bg-gray-800'}"
				>
					Graph
				</button>
			</div>
		</div>
	</div>

	{#if !graphView}
		<div class="text-xs text-gray-400">
			<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>/<kbd
				class="border border-gray-300 bg-gray-50 px-1">k</kbd
			>
			navigate &middot;
			<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd> new &middot;
			<kbd class="border border-gray-300 bg-gray-50 px-1">Enter</kbd> expand &middot;
			<kbd class="border border-gray-300 bg-gray-50 px-1">e</kbd> edit &middot;
			<kbd class="border border-gray-300 bg-gray-50 px-1">Esc</kbd> close
		</div>
	{/if}

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if !graphView}
		{#if showForm}
			<form
				method="post"
				action="?/create"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showForm = false;
					};
				}}
				class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm"
			>
				<label class="block">
					<span class="text-sm font-medium text-gray-700">Belief</span>
					<textarea
						name="content"
						required
						rows="3"
						placeholder="vivid, first person, present tense, highly specific"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					></textarea>
				</label>
				<label class="block">
					<span class="text-sm font-medium text-gray-700">Valence</span>
					<select
						name="valence"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						<option value="">Neutral</option>
						<option value="positive">Positive</option>
						<option value="negative">Negative</option>
					</select>
				</label>
				<label class="block">
					<span class="text-sm font-medium text-gray-700">Tags</span>
					<input
						type="text"
						name="tags"
						placeholder="tags (comma separated)"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<button
					type="submit"
					class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					Create
				</button>
			</form>
		{/if}

		{#if beliefsList().length === 0}
			<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
				No beliefs yet. Add one to start reconsolidation work.
			</div>
		{:else}
			<div class="space-y-3">
				{#each beliefsList() as belief, i (belief.id)}
					{@const isExpanded = expandedBeliefId === belief.id}
					{@const isEditing = editingBeliefId === belief.id}
					{@const latest = latestIntensity(belief.id)}
					{@const outgoingRelations = belief.relatedBeliefs.filter(
						(r) => r.direction === 'outgoing'
					)}
					{@const incomingRelations = belief.relatedBeliefs.filter(
						(r) => r.direction === 'incoming'
					)}
					<div
						class="border border-gray-200 bg-white shadow-sm {i === selectedBeliefIndex
							? 'ring-2 ring-gray-900 ring-inset'
							: ''}"
					>
						<div class="flex items-center gap-4 px-4 py-3">
							<span
								class="flex h-6 w-6 shrink-0 items-center justify-center border border-gray-300 bg-gray-50 font-mono text-xs font-medium text-gray-500"
								title="Belief #{belief.id}"
							>
								{belief.id}
							</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									{#if belief.valence === 'positive'}
										<span class="text-xs font-medium text-blue-600">+</span>
									{:else if belief.valence === 'negative'}
										<span class="text-xs font-medium text-red-500">&minus;</span>
									{/if}
									<span class="text-sm font-medium text-gray-900">{belief.content}</span>
									{#if latest}
										<span class="text-xs font-medium text-gray-600">{latest}/10</span>
									{/if}
								</div>
								<div class="flex items-center gap-3 text-xs text-gray-400">
									<span>{outgoingRelations.length + incomingRelations.length} related</span>
									<span>{belief.linkedEvidence.length} evidence</span>
									{#if belief.linkedHabits.length > 0}
										<span
											>{belief.linkedHabits.length}
											linked habit{belief.linkedHabits.length === 1 ? '' : 's'}</span
										>
									{/if}
								</div>
								{#if belief.tags && belief.tags.length > 0}
									<div class="mt-1 flex flex-wrap gap-1">
										{#each belief.tags as tag (tag.linkId)}
											<span
												class="border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500"
											>
												#{tag.tagName}
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="flex shrink-0 items-center gap-2">
								<button
									onclick={() => {
										recordingBeliefId = recordingBeliefId === belief.id ? null : belief.id;
										initIntensityForm(belief.id);
									}}
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100 {recordingBeliefId ===
									belief.id
										? 'bg-gray-100'
										: ''}"
								>
									Record
								</button>
								<button
									onclick={() => {
										expandedBeliefId = isExpanded ? null : belief.id;
										editingBeliefId = null;
										confirmingDeleteId = null;
									}}
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								>
									{isExpanded ? 'Collapse' : 'Expand'}
								</button>
								{#if confirmingDeleteId === belief.id}
									<form method="post" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={belief.id} />
										<button
											type="submit"
											class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
										>
											Confirm?
										</button>
									</form>
								{:else}
									<button
										onclick={() => {
											confirmingDeleteId = belief.id;
										}}
										class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
									>
										Delete
									</button>
								{/if}
							</div>
						</div>

						{#if recordingBeliefId === belief.id}
							<div class="border-t border-purple-100 bg-purple-50 px-4 py-3">
								<div class="mb-2">
									<span class="text-xs font-medium text-purple-600">Intensity</span>
								</div>

								{#if belief.intensities.length > 0}
									<div class="mb-3 flex items-end gap-1" style="height: 44px">
										{#each belief.intensities.slice(0, 20).toReversed() as intensity (intensity.id)}
											<div
												class="w-4 bg-gray-900"
												style="height: {getIntensityBarHeight(intensity.value)}"
												title="{intensity.date}: {intensity.value}/10{intensity.notes
													? ` - ${intensity.notes}`
													: ''}"
											></div>
										{/each}
									</div>
									<div class="mb-3 space-y-1">
										{#each belief.intensities.slice(0, 5) as intensity (intensity.id)}
											<div class="flex items-center justify-between text-xs">
												<span class="text-gray-500">{intensity.date}</span>
												<span class="font-medium text-gray-900">{intensity.value}/10</span>
												{#if intensity.notes}
													<span class="text-gray-400">{intensity.notes}</span>
												{/if}
											</div>
										{/each}
										{#if belief.intensities.length > 5}
											<div class="text-xs text-gray-400">
												and {belief.intensities.length - 5} more...
											</div>
										{/if}
									</div>
								{/if}

								<div class="border border-gray-100 bg-gray-50 p-3">
									<form
										method="post"
										action="?/logIntensity"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
												intensityValue[belief.id] = 5;
												intensityNotes[belief.id] = '';
											};
										}}
										class="space-y-2"
									>
										<input type="hidden" name="beliefId" value={belief.id} />
										<div class="flex items-center gap-3">
											<input
												type="range"
												name="value"
												min="1"
												max="10"
												value={intensityValue[belief.id] ?? 5}
												oninput={(e) => {
													initIntensityForm(belief.id);
													intensityValue[belief.id] = parseInt(
														(e.target as HTMLInputElement).value
													);
												}}
												class="flex-1"
											/>
											<span class="w-8 text-center text-sm font-medium text-gray-900"
												>{intensityValue[belief.id] ?? 5}</span
											>
										</div>
										<div class="flex gap-2">
											<input
												name="date"
												type="date"
												value={intensityDate[belief.id] ?? data.today}
												oninput={(e) => {
													initIntensityForm(belief.id);
													intensityDate[belief.id] = (e.target as HTMLInputElement).value;
												}}
												class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<input
												name="notes"
												type="text"
												placeholder="optional notes"
												value={intensityNotes[belief.id] ?? ''}
												oninput={(e) => {
													initIntensityForm(belief.id);
													intensityNotes[belief.id] = (e.target as HTMLInputElement).value;
												}}
												class="flex-1 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<button
												type="submit"
												class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
											>
												Log
											</button>
										</div>
									</form>
								</div>
							</div>
						{/if}

						{#if isExpanded}
							<div>
								{#if isEditing}
									<div class="border-t border-gray-200 px-4 py-3">
										<form
											method="post"
											action="?/update"
											use:enhance={() => {
												return async ({ update }) => {
													await update();
													editingBeliefId = null;
												};
											}}
											class="space-y-3"
										>
											<input type="hidden" name="id" value={belief.id} />
											<label class="block">
												<span class="text-xs font-medium text-gray-500">Edit Belief</span>
												<textarea
													name="content"
													required
													rows="2"
													class="edit-belief-textarea mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
													>{belief.content}</textarea
												>
											</label>
											<label class="block">
												<span class="text-xs font-medium text-gray-500">Valence</span>
												<select
													name="valence"
													class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
												>
													<option value="" selected={!belief.valence}>Neutral</option>
													<option value="positive" selected={belief.valence === 'positive'}
														>Positive</option
													>
													<option value="negative" selected={belief.valence === 'negative'}
														>Negative</option
													>
												</select>
											</label>
											<label class="block">
												<span class="text-xs font-medium text-gray-500">Tags</span>
												<input
													type="text"
													name="tags"
													value={belief.tags?.map((t) => t.tagName).join(', ') ?? ''}
													placeholder="tags (comma separated)"
													class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
												/>
											</label>
											<div class="flex gap-2">
												<button
													type="submit"
													class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
												>
													Save
												</button>
												<button
													type="button"
													onclick={() => {
														editingBeliefId = null;
													}}
													class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
												>
													Cancel
												</button>
											</div>
										</form>
									</div>
								{:else}
									<button
										onclick={() => {
											editingBeliefId = belief.id;
										}}
										class="w-full border-t border-gray-200 px-4 py-2 text-left text-xs text-gray-400 transition hover:bg-gray-50"
									>
										Edit belief
									</button>
								{/if}

								<div class="border-t border-blue-100 bg-blue-50 px-4 py-3">
									<div class="mb-2">
										<span class="text-xs font-medium text-blue-600">Related Beliefs</span>
									</div>
									{#if outgoingRelations.length > 0}
										<div class="mb-3 space-y-2">
											{#each outgoingRelations as rel (rel.relationId)}
												<div class="flex items-center justify-between gap-2">
													<div class="flex items-center gap-2">
														<span class="text-xs text-gray-400">this</span>
														<span
															class="{rel.type === 'supports'
																? 'border border-blue-200 bg-blue-50 text-blue-700'
																: 'border border-red-200 bg-red-50 text-red-700'} px-1.5 py-0.5 text-xs"
														>
															{rel.type}
														</span>
														<span class="text-xs text-gray-400">that</span>
														<span class="text-sm text-gray-700">{rel.beliefContent}</span>
													</div>
													<form method="post" action="?/removeRelation" use:enhance>
														<input type="hidden" name="id" value={rel.relationId} />
														<button
															type="submit"
															class="text-xs text-gray-400 transition hover:text-red-500"
														>
															&times;
														</button>
													</form>
												</div>
											{/each}
										</div>
									{/if}
									{#if incomingRelations.length > 0}
										<div class="mb-3 space-y-2">
											{#each incomingRelations as rel (rel.relationId)}
												<div class="flex items-center justify-between gap-2">
													<div class="flex items-center gap-2">
														<span class="text-sm text-gray-700">{rel.beliefContent}</span>
														<span
															class="{rel.type === 'supports'
																? 'border border-blue-200 bg-blue-50 text-blue-700'
																: 'border border-red-200 bg-red-50 text-red-700'} px-1.5 py-0.5 text-xs"
														>
															{rel.type}
														</span>
														<span class="text-xs text-gray-400">this</span>
													</div>
													<form method="post" action="?/removeRelation" use:enhance>
														<input type="hidden" name="id" value={rel.relationId} />
														<button
															type="submit"
															class="text-xs text-gray-400 transition hover:text-red-500"
														>
															&times;
														</button>
													</form>
												</div>
											{/each}
										</div>
									{/if}
									{#if unlinkedBeliefs(belief.id).length > 0}
										{@const flipped = linkBeliefFlipped[belief.id] ?? false}
										<form method="post" action="?/addRelation" use:enhance class="space-y-2">
											<input
												type="hidden"
												name="sourceBeliefId"
												value={flipped ? (linkBeliefSelect[belief.id] ?? '') : belief.id}
											/>
											<input
												type="hidden"
												name="targetBeliefId"
												value={flipped ? belief.id : (linkBeliefSelect[belief.id] ?? '')}
											/>
											<div class="flex items-center gap-1.5 text-xs text-gray-500">
												{#if !flipped}
													<span class="font-medium text-gray-700">this</span>
												{:else}
													<span
														class="max-w-[200px] truncate font-medium text-gray-700"
														title={selectedBeliefContent(belief.id)}
														>{selectedBeliefContent(belief.id)}</span
													>
												{/if}
												<select
													name="type"
													class="border border-gray-300 py-1 pr-6 pl-2 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
												>
													<option value="supports">supports</option>
													<option value="contradicts">contradicts</option>
												</select>
												{#if !flipped}
													<span
														class="max-w-[200px] truncate font-medium text-gray-700"
														title={selectedBeliefContent(belief.id)}
														>{selectedBeliefContent(belief.id)}</span
													>
												{:else}
													<span class="font-medium text-gray-700">this</span>
												{/if}
												<button
													type="button"
													onclick={() => {
														linkBeliefFlipped[belief.id] = !flipped;
													}}
													class="border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-600 transition hover:bg-gray-100"
													title="Flip direction"
												>
													⇄
												</button>
											</div>
											<div class="flex min-w-0 gap-2">
												<select
													bind:value={linkBeliefSelect[belief.id]}
													class="min-w-0 flex-1 border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
												>
													<option value={null}>Select belief...</option>
													{#each unlinkedBeliefs(belief.id) as b (b.id)}
														<option value={b.id}>{b.content}</option>
													{/each}
												</select>
												<button
													type="submit"
													disabled={!linkBeliefSelect[belief.id]}
													class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
												>
													Link
												</button>
											</div>
										</form>
									{/if}
								</div>

								<div class="border-t border-amber-100 bg-amber-50 px-4 py-3">
									<div class="mb-2">
										<span class="text-xs font-medium text-amber-600">Evidence</span>
									</div>
									{#if belief.linkedEvidence.length > 0}
										<div class="mb-3 space-y-2">
											{#each belief.linkedEvidence as ev (ev.linkId)}
												<div class="flex items-center justify-between gap-2">
													<div class="flex items-center gap-1.5">
														<span class="text-sm text-gray-700">{ev.evidenceContent}</span>
														<span
															class="{rel.type === 'supports'
																? 'border border-blue-200 bg-blue-50 text-blue-700'
																: 'border border-red-200 bg-red-50 text-red-700'} px-1 py-0.5 text-xs"
														>
															{rel.type}
														</span>
														<span class="text-xs text-gray-400">this</span>
													</div>
													<div class="flex items-center gap-2">
														<form method="post" action="?/deleteEvidence" use:enhance>
															<input type="hidden" name="id" value={ev.evidenceId} />
															<button
																type="submit"
																class="text-xs text-gray-400 transition hover:text-red-500"
																title="Delete evidence"
															>
																del
															</button>
														</form>
														<form method="post" action="?/unlinkEvidence" use:enhance>
															<input type="hidden" name="id" value={ev.linkId} />
															<button
																type="submit"
																class="text-xs text-gray-400 transition hover:text-red-500"
															>
																&times;
															</button>
														</form>
													</div>
												</div>
											{/each}
										</div>
									{/if}
									<div class="space-y-2">
										{#if unlinkedEvidence(belief.id).length > 0}
											<form method="post" action="?/linkEvidence" use:enhance class="space-y-2">
												<input type="hidden" name="beliefId" value={belief.id} />
												<div class="flex items-center gap-1.5 text-xs text-gray-500">
													<span
														class="max-w-[200px] truncate font-medium text-gray-700"
														title={selectedEvidenceContent(belief.id)}
														>{selectedEvidenceContent(belief.id)}</span
													>
													<select
														name="type"
														class="border border-gray-300 py-1 pr-6 pl-2 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
													>
														<option value="supports">supports</option>
														<option value="contradicts">contradicts</option>
													</select>
													<span class="font-medium text-gray-700">this</span>
												</div>
												<div class="flex gap-2">
													<select
														name="evidenceId"
														bind:value={linkEvidenceSelect[belief.id]}
														class="flex-1 border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
													>
														<option value={null}>Select evidence...</option>
														{#each unlinkedEvidence(belief.id) as ev (ev.id)}
															<option value={ev.id}>{ev.content}</option>
														{/each}
													</select>
													<button
														type="submit"
														disabled={!linkEvidenceSelect[belief.id]}
														class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
													>
														Link
													</button>
												</div>
											</form>
										{/if}
										<form
											method="post"
											action="?/createEvidence"
											use:enhance={() => {
												return async ({ update }) => {
													await update();
													newEvidenceContent[belief.id] = '';
												};
											}}
											class="space-y-2"
										>
											<input type="hidden" name="beliefId" value={belief.id} />
											<div class="flex items-center gap-1.5 text-xs text-gray-500">
												<span class="font-medium text-gray-700"
													>{newEvidenceContent[belief.id]?.trim() || '(new evidence)'}</span
												>
												<select
													name="type"
													class="border border-gray-300 py-1 pr-6 pl-2 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
												>
													<option value="supports">supports</option>
													<option value="contradicts">contradicts</option>
												</select>
												<span class="font-medium text-gray-700">this</span>
											</div>
											<div class="flex gap-2">
												<input
													name="content"
													type="text"
													placeholder="new evidence..."
													bind:value={newEvidenceContent[belief.id]}
													class="flex-1 border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
												/>
												<button
													type="submit"
													disabled={!newEvidenceContent[belief.id]?.trim()}
													class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
												>
													Create
												</button>
											</div>
										</form>
									</div>
								</div>

								<div class="border-t border-emerald-100 bg-emerald-50 px-4 py-3">
									<div class="mb-2">
										<span class="text-xs font-medium text-emerald-600">Linked Habits</span>
									</div>
									<div class="mb-3 space-y-2">
										{#each belief.linkedHabits as linked (linked.linkId)}
											<div class="flex items-center justify-between gap-2">
												<div class="flex items-center gap-2">
													<span class="text-sm text-gray-700">{linked.habitName}</span>
													<span
														class="text-xs {linked.habitType === 'bad'
															? 'text-red-500'
															: 'text-emerald-600'}">{linked.habitType}</span
													>
												</div>
												<form method="post" action="?/unlinkHabit" use:enhance>
													<input type="hidden" name="id" value={linked.linkId} />
													<button
														type="submit"
														class="text-xs text-gray-400 transition hover:text-red-500"
													>
														&times;
													</button>
												</form>
											</div>
										{/each}
									</div>
									{#if unlinkedHabits(belief.id).length > 0}
										<form method="post" action="?/linkHabit" use:enhance class="flex gap-2">
											<input type="hidden" name="beliefId" value={belief.id} />
											<select
												name="habitId"
												bind:value={linkHabitSelect[belief.id]}
												class="flex-1 border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											>
												<option value={null}>Select habit...</option>
												{#each unlinkedHabits(belief.id) as habit (habit.id)}
													<option value={habit.id}>{habit.name}</option>
												{/each}
											</select>
											<button
												type="submit"
												disabled={!linkHabitSelect[belief.id]}
												class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
											>
												Link
											</button>
										</form>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="space-y-2">
			<div class="flex items-center gap-3">
				{#if pendingRelations.length > 0}
					<span class="text-sm text-gray-500">{pendingRelations.length} pending</span>
					<button
						onclick={saveRelations}
						class="bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-800"
					>
						Save ({pendingRelations.length})
					</button>
				{/if}
				{#if graphShowNewBeliefForm}
					<div class="flex flex-wrap items-center gap-2">
						<input
							type="text"
							placeholder="belief text..."
							bind:value={graphNewBeliefContent}
							class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<select
							bind:value={graphNewBeliefValence}
							class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							<option value="">Neutral</option>
							<option value="positive">Positive</option>
							<option value="negative">Negative</option>
						</select>
						<button
							onclick={graphCreateBelief}
							disabled={!graphNewBeliefContent.trim()}
							class="bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
						>
							Create
						</button>
						<button
							onclick={() => {
								graphShowNewBeliefForm = false;
								graphNewBeliefContent = '';
								graphNewBeliefValence = '';
							}}
							class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
						>
							Cancel
						</button>
					</div>
				{:else}
					<button
						onclick={() => {
							graphShowNewBeliefForm = true;
						}}
						class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
					>
						New Belief
					</button>
				{/if}
			</div>
			<p class="text-xs text-gray-400">
				Drag from a handle to connect beliefs. Hover an edge label and click &times; to remove it.
				Double-click a belief to edit its text.
			</p>
		</div>

		{#if data.beliefs.length === 0}
			<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
				No beliefs yet. Add one to start reconsolidation work.
			</div>
		{:else}
			<div class="relative flex" style="width: 100%; height: calc(100vh - 180px);">
				<div class="flex-1 border border-gray-200 shadow-sm">
					<SvelteFlow
						bind:nodes
						bind:edges
						{nodeTypes}
						{edgeTypes}
						{onconnect}
						{isValidConnection}
						onbeforedelete={handleBeforeDelete}
						onedgesdelete={handleEdgesDelete}
						onnodedragstop={handleNodeDragStop}
						fitView
						deleteKey="Delete"
						minZoom={0.3}
						maxZoom={3}
						selectionOnDrag={false}
						panOnDrag
						onnodeclick={(e) => {
							if (!e.node.id.startsWith('b-')) return;
							const beliefId = parseInt(e.node.id.replace('b-', ''));
							openBeliefPanel(beliefId);
						}}
					>
						<Controls />
						<Background variant={BackgroundVariant.Dots} />
						<MiniMap />
					</SvelteFlow>

					{#if typePicker}
						<div
							class="absolute z-50 flex flex-col gap-2 border border-gray-200 bg-white p-3 shadow-sm"
							style="left: {typePicker.x}px; top: {typePicker.y}px; transform: translate(-50%, -50%);"
						>
							<span class="text-xs font-medium text-gray-600">Relation type:</span>
							<div class="flex gap-2">
								<button
									onclick={() => selectType('supports')}
									class="px-3 py-1 text-xs"
									style="background-color: #eff6ff; color: #1e40af; border: 1px solid #93c5fd;"
								>
									Supports
								</button>
								<button
									onclick={() => selectType('contradicts')}
									class="px-3 py-1 text-xs"
									style="background-color: #fef2f2; color: #dc2626; border: 1px solid #fca5a5;"
								>
									Contradicts
								</button>
							</div>
							<button onclick={cancelTypePicker} class="text-xs text-gray-400 hover:text-gray-600">
								Cancel
							</button>
						</div>
					{/if}

					{#if evidenceTypePicker}
						<div
							class="absolute z-50 flex flex-col gap-2 border border-gray-200 bg-white p-3 shadow-sm"
							style="left: {evidenceTypePicker.x}px; top: {evidenceTypePicker.y}px; transform: translate(-50%, -50%);"
						>
							<span class="text-xs font-medium text-gray-600">Evidence link type:</span>
							<div class="flex gap-2">
								<button
									onclick={() => selectEvidenceType('supports')}
									class="px-3 py-1 text-xs"
									style="background-color: #eff6ff; color: #1e40af; border: 1px solid #93c5fd;"
								>
									Supports
								</button>
								<button
									onclick={() => selectEvidenceType('contradicts')}
									class="px-3 py-1 text-xs"
									style="background-color: #fef2f2; color: #dc2626; border: 1px solid #fca5a5;"
								>
									Contradicts
								</button>
							</div>
							<button
								onclick={cancelEvidenceTypePicker}
								class="text-xs text-gray-400 hover:text-gray-600"
							>
								Cancel
							</button>
						</div>
					{/if}
				</div>

				{#if selectedGraphBeliefId}
					{@const belief = data.beliefs.find((b) => b.id === selectedGraphBeliefId)}
					{#if belief}
						<div class="flex h-full w-[350px] flex-col border-l border-gray-200 bg-white shadow-sm">
							<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
								<span class="font-mono text-sm font-medium text-gray-500">#{belief.id}</span>
								<button
									onclick={() => {
										selectedGraphBeliefId = null;
									}}
									class="text-gray-400 hover:text-gray-600"
								>
									&times;
								</button>
							</div>

							<div class="flex-1 overflow-y-auto px-4 py-3">
								<div class="mb-4 space-y-3">
									<div>
										<span class="text-xs font-medium text-gray-500">Content</span>
										<textarea
											bind:value={panelEditContent}
											rows="3"
											class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										></textarea>
									</div>
									<div>
										<span class="text-xs font-medium text-gray-500">Valence</span>
										<select
											bind:value={panelEditValence}
											class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										>
											<option value="">Neutral</option>
											<option value="positive">Positive</option>
											<option value="negative">Negative</option>
										</select>
									</div>
									<button
										onclick={saveBeliefEdits}
										class="w-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
									>
										Save
									</button>
								</div>

								<div class="mb-4 space-y-2 rounded-none border border-cyan-100 bg-cyan-50 p-3">
									{#if belief.tags && belief.tags.length > 0}
										<div>
											<span class="text-xs font-medium text-cyan-600">Tags</span>
											<div class="mt-1 flex flex-wrap gap-1">
												{#each belief.tags as tag (tag.linkId)}
													<span
														class="flex items-center gap-1 border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500"
													>
														#{tag.tagName}
														<button
															onclick={() => graphRemoveTag(tag.linkId)}
															class="text-gray-400 hover:text-red-500"
														>
															&times;
														</button>
													</span>
												{/each}
											</div>
										</div>
									{/if}
									<div>
										<span class="text-xs font-medium text-gray-500">Add Tag</span>
										<div class="mt-1 flex gap-2">
											<input
												type="text"
												placeholder="tag name"
												bind:value={panelNewTagName}
												class="flex-1 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<button
												onclick={submitPanelTag}
												disabled={!panelNewTagName.trim()}
												class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
											>
												Add
											</button>
										</div>
									</div>
								</div>

								<div class="mb-4 space-y-2 rounded-none border border-blue-100 bg-blue-50 p-3">
									<span class="text-xs font-medium text-blue-600">Related Beliefs</span>
									{#if belief.relatedBeliefs.length > 0}
										<div class="space-y-2">
											{#each belief.relatedBeliefs as rel (rel.relationId)}
												<div class="flex items-center justify-between gap-2">
													<div class="flex items-center gap-1.5">
														{#if rel.direction === 'outgoing'}
															<span class="text-xs text-gray-400">this</span>
															<span
																class="{rel.type === 'supports'
																	? 'border border-blue-200 bg-blue-50 text-blue-700'
																	: 'border border-red-200 bg-red-50 text-red-700'} px-1 py-0.5 text-xs"
															>
																{rel.type}
															</span>
															<span class="text-xs text-gray-400">that</span>
														{:else}
															<span class="text-xs text-gray-400">that</span>
															<span
																class="{rel.type === 'supports'
																	? 'border border-blue-200 bg-blue-50 text-blue-700'
																	: 'border border-red-200 bg-red-50 text-red-700'} px-1 py-0.5 text-xs"
															>
																{rel.type}
															</span>
															<span class="text-xs text-gray-400">this</span>
														{/if}
														<span class="text-xs text-gray-700">{rel.beliefContent}</span>
													</div>
													<button
														onclick={() => graphRemoveRelation(rel.relationId)}
														class="text-xs text-gray-400 hover:text-red-500"
													>
														&times;
													</button>
												</div>
											{/each}
										</div>
									{/if}
									{#if unlinkedBeliefs(belief.id).length > 0}
										<div class="flex items-center gap-1.5 text-xs text-gray-500">
											<span class="font-medium text-gray-700">this</span>
											<select
												bind:value={panelLinkBeliefType}
												class="border border-gray-300 py-0.5 pr-4 pl-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											>
												<option value="supports">supports</option>
												<option value="contradicts">contradicts</option>
											</select>
											<select
												bind:value={panelLinkBeliefSelect}
												class="flex-1 border border-gray-300 px-1 py-0.5 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											>
												<option value={null}>Select...</option>
												{#each unlinkedBeliefs(belief.id) as b (b.id)}
													<option value={b.id}>{b.content}</option>
												{/each}
											</select>
										</div>
										<button
											onclick={submitPanelRelation}
											disabled={!panelLinkBeliefSelect}
											class="w-full border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
										>
											Add Relation
										</button>
									{/if}
								</div>

								<div class="mb-4 space-y-2 rounded-none border border-amber-100 bg-amber-50 p-3">
									<span class="text-xs font-medium text-amber-600">Evidence</span>
									{#if belief.linkedEvidence.length > 0}
										<div class="space-y-2">
											{#each belief.linkedEvidence as ev (ev.linkId)}
												<div class="flex items-center justify-between gap-2">
													<div class="flex items-center gap-1.5">
														<span class="text-xs text-gray-700">{ev.evidenceContent}</span>
														<span
															class="{ev.type === 'supports'
																? 'border border-blue-200 bg-blue-50 text-blue-700'
																: 'border border-red-200 bg-red-50 text-red-700'} px-1 py-0.5 text-xs"
														>
															{ev.type}
														</span>
													</div>
													<div class="flex gap-1">
														<button
															onclick={() => graphDeleteEvidence(ev.evidenceId)}
															class="text-xs text-gray-400 hover:text-red-500"
															title="Delete"
														>
															del
														</button>
														<button
															onclick={() => graphUnlinkEvidence(ev.linkId)}
															class="text-xs text-gray-400 hover:text-red-500"
														>
															&times;
														</button>
													</div>
												</div>
											{/each}
										</div>
									{/if}
									{#if unlinkedEvidence(belief.id).length > 0}
										<div class="flex items-center gap-1.5 text-xs text-gray-500">
											<select
												bind:value={panelLinkEvidenceSelect}
												class="flex-1 border border-gray-300 px-1 py-0.5 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											>
												<option value={null}>Select evidence...</option>
												{#each unlinkedEvidence(belief.id) as ev (ev.id)}
													<option value={ev.id}>{ev.content}</option>
												{/each}
											</select>
											<select
												bind:value={panelLinkEvidenceType}
												class="border border-gray-300 py-0.5 pr-4 pl-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											>
												<option value="supports">supports</option>
												<option value="contradicts">contradicts</option>
											</select>
										</div>
										<button
											onclick={submitPanelLinkEvidence}
											disabled={!panelLinkEvidenceSelect}
											class="w-full border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
										>
											Link Evidence
										</button>
									{/if}
									<div class="flex items-center gap-1.5 text-xs text-gray-500">
										<input
											type="text"
											placeholder="new evidence..."
											bind:value={panelNewEvidenceContent}
											class="flex-1 border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										/>
										<select
											bind:value={panelLinkEvidenceType}
											class="border border-gray-300 py-0.5 pr-4 pl-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										>
											<option value="supports">supports</option>
											<option value="contradicts">contradicts</option>
										</select>
									</div>
									<button
										onclick={submitPanelEvidence}
										disabled={!panelNewEvidenceContent.trim()}
										class="w-full border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
									>
										Create Evidence
									</button>
								</div>

								<div
									class="mb-4 space-y-2 rounded-none border border-emerald-100 bg-emerald-50 p-3"
								>
									<span class="text-xs font-medium text-emerald-600">Linked Habits</span>
									{#if belief.linkedHabits.length > 0}
										<div class="space-y-2">
											{#each belief.linkedHabits as linked (linked.linkId)}
												<div class="flex items-center justify-between gap-2">
													<div class="flex items-center gap-1.5">
														<span class="text-xs text-gray-700">{linked.habitName}</span>
														<span
															class="text-xs {linked.habitType === 'bad'
																? 'text-red-500'
																: 'text-emerald-600'}">{linked.habitType}</span
														>
													</div>
													<button
														onclick={() => graphUnlinkHabit(linked.linkId)}
														class="text-xs text-gray-400 hover:text-red-500"
													>
														&times;
													</button>
												</div>
											{/each}
										</div>
									{/if}
									{#if unlinkedHabits(belief.id).length > 0}
										<select
											bind:value={panelLinkHabitSelect}
											class="w-full border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										>
											<option value={null}>Select habit...</option>
											{#each unlinkedHabits(belief.id) as habit (habit.id)}
												<option value={habit.id}>{habit.name}</option>
											{/each}
										</select>
										<button
											onclick={submitPanelHabit}
											disabled={!panelLinkHabitSelect}
											class="w-full border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
										>
											Link Habit
										</button>
									{/if}
								</div>

								<div class="mb-4 space-y-2 rounded-none border border-purple-100 bg-purple-50 p-3">
									<span class="text-xs font-medium text-purple-600">Intensity Log</span>
									{#if belief.intensities.length > 0}
										<div class="mb-2 flex items-end gap-1" style="height: 44px">
											{#each belief.intensities
												.slice(0, 15)
												.toReversed() as intensity (intensity.id)}
												<div
													class="w-4 bg-gray-900"
													style="height: {getIntensityBarHeight(intensity.value)}"
													title="{intensity.date}: {intensity.value}/10"
												></div>
											{/each}
										</div>
									{/if}
									<div class="flex items-center gap-2">
										<input
											type="range"
											min="1"
											max="10"
											bind:value={panelIntensityValue}
											class="flex-1"
										/>
										<span class="w-6 text-center text-xs font-medium">{panelIntensityValue}</span>
									</div>
									<div class="flex gap-2">
										<input
											type="date"
											bind:value={panelIntensityDate}
											class="border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										/>
										<input
											type="text"
											placeholder="notes..."
											bind:value={panelIntensityNotes}
											class="flex-1 border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										/>
									</div>
									<button
										onclick={submitPanelIntensity}
										class="w-full border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50"
									>
										Log
									</button>
								</div>

								<div class="border-t border-gray-200 pt-4">
									{#if panelConfirmDelete}
										<div class="space-y-2">
											<span class="text-xs text-red-600">Delete this belief?</span>
											<div class="flex gap-2">
												<button
													onclick={() => graphDeleteBelief(belief.id)}
													class="flex-1 border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
												>
													Confirm
												</button>
												<button
													onclick={() => {
														panelConfirmDelete = false;
													}}
													class="flex-1 border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50"
												>
													Cancel
												</button>
											</div>
										</div>
									{:else}
										<button
											onclick={() => {
												panelConfirmDelete = true;
											}}
											class="w-full border border-red-200 bg-white px-2 py-1 text-xs text-red-600 shadow-sm hover:bg-red-50"
										>
											Delete Belief
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	:global(.svelte-flow) {
		background: white;
	}

	:global(.svelte-flow__node) {
		border-radius: 0 !important;
	}

	:global(.svelte-flow__minimap) {
		border-radius: 0 !important;
	}

	:global(.svelte-flow__controls) {
		border-radius: 0 !important;
	}

	:global(.svelte-flow__controls button) {
		border-radius: 0 !important;
	}
</style>
