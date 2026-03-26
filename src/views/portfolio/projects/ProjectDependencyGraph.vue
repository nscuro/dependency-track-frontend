<template>
  <div>
    <div style="text-align: center; font-size: xxx-large" v-show="loading">
      Loading, please wait...
    </div>
    <div v-show="!loading">
      <span
        v-if="
          this.$route.params.componentUuids &&
          this.$route.params.componentUuids.length > 0 &&
          this.project.directDependencies &&
          this.project.directDependencies.length > 0 &&
          !this.notFound
        "
      >
        <c-switch
          style="margin-left: 1.5rem; margin-right: 0.5rem"
          id="showCompleteGraph"
          color="primary"
          v-model="showCompleteGraph"
          label
          v-bind="labelIcon"
        />
        <span class="text-muted">{{ $t('message.show_complete_graph') }}</span>
      </span>
      <c-switch
        style="margin-left: 1.5rem; margin-right: 0.5rem"
        id="highlightOutdatedComponents"
        color="primary"
        v-model="highlightOutdatedComponents"
        label
        v-bind="labelIcon"
      />
      <span class="text-muted">{{
        $t('message.show_update_information')
      }}</span>
      <br />
      <span v-if="notFound">
        <span class="text-muted">{{
          $t('message.not_found_in_dependency_graph')
        }}</span>
        <br />
      </span>
      <div class="graph-wrapper">
        <div class="graph-controls">
          <span class="control-group">
            <button
              class="btn btn-sm btn-outline-primary"
              @click="setLayout('dagre-LR')"
              :class="{ active: activeLayout === 'dagre-LR' }"
            >
              <i class="fa fa-arrow-right"></i> LR
            </button>
            <button
              class="btn btn-sm btn-outline-primary"
              @click="setLayout('dagre-TB')"
              :class="{ active: activeLayout === 'dagre-TB' }"
            >
              <i class="fa fa-arrow-down"></i> TB
            </button>
            <button
              class="btn btn-sm btn-outline-primary"
              @click="setLayout('dagre-RL')"
              :class="{ active: activeLayout === 'dagre-RL' }"
            >
              <i class="fa fa-arrow-left"></i> RL
            </button>
            <button
              class="btn btn-sm btn-outline-primary"
              @click="setLayout('network')"
              :class="{ active: activeLayout === 'network' }"
            >
              <i class="fa fa-share-alt"></i> Network
            </button>
          </span>
          <span class="control-group">
            <button
              class="btn btn-sm btn-outline-secondary"
              @click="fitToScreen"
            >
              <i class="fa fa-compress"></i> Fit
            </button>
            <button
              class="btn btn-sm btn-outline-secondary"
              @click="centerOnRoot"
            >
              <i class="fa fa-crosshairs"></i> Root
            </button>
          </span>
        </div>
        <div ref="cyContainer" class="cy-container"></div>
      </div>
    </div>
  </div>
</template>

<script>
import cytoscape from 'cytoscape';
import cytoscapeDagre from 'cytoscape-dagre';
import permissionsMixin from '../../../mixins/permissionsMixin';
import xssFilters from 'xss-filters';
import { Switch as cSwitch } from '@coreui/vue';

let _dagreRegistered = false;
if (!_dagreRegistered) {
  cytoscape.use(cytoscapeDagre);
  _dagreRegistered = true;
}

export default {
  mixins: [permissionsMixin],
  components: {
    cSwitch,
  },
  props: {
    project: Object,
    uuid: String,
  },
  beforeCreate() {
    this.highlightOutdatedComponents =
      localStorage &&
      localStorage.getItem(
        'ProjectDependencyGraphHighlightOutdatedComponents',
      ) !== null
        ? localStorage.getItem(
            'ProjectDependencyGraphHighlightOutdatedComponents',
          ) === 'true'
        : false;
    this.showCompleteGraph =
      localStorage &&
      localStorage.getItem('ProjectDependencyGraphShowCompleteGraph') !== null
        ? localStorage.getItem('ProjectDependencyGraphShowCompleteGraph') ===
          'true'
        : false;
  },
  created() {
    // Non-reactive: must NOT be in data() to avoid Vue 2 deep-observing
    // the massive cytoscape instance object, which freezes the browser.
    this.cy = null;
    this.graphResponse = null;
    this.expandedComponents = new Set();
  },
  mounted() {
    this.computeData();
  },
  beforeDestroy() {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  },
  data() {
    return {
      loading: false,
      showCompleteGraph: this.showCompleteGraph,
      notFound: false,
      highlightOutdatedComponents: this.highlightOutdatedComponents,
      activeLayout: 'dagre-LR',
      labelIcon: {
        dataOn: '\u2713',
        dataOff: '\u2715',
      },
      searchedComponentUuids: {},
    };
  },
  watch: {
    project() {
      this.computeData();
    },
    showCompleteGraph() {
      if (this.$route.params.componentUuids && localStorage) {
        localStorage.setItem(
          'ProjectDependencyGraphShowCompleteGraph',
          this.showCompleteGraph.toString(),
        );
      }
      if (this.graphResponse) {
        this.renderSearchedGraph(this.graphResponse, !this.showCompleteGraph);
      }
    },
    highlightOutdatedComponents() {
      if (localStorage) {
        localStorage.setItem(
          'ProjectDependencyGraphHighlightOutdatedComponents',
          this.highlightOutdatedComponents.toString(),
        );
      }
      if (this.cy) {
        this.applyOutdatedHighlighting();
      }
    },
    $route(to, from) {
      if (!to.params.componentUuids && from.params.componentUuids) {
        this.showCompleteGraph = true;
      } else if (to.params.componentUuids && !from.params.componentUuids) {
        this.showCompleteGraph =
          localStorage &&
          localStorage.getItem('ProjectDependencyGraphShowCompleteGraph') !==
            null
            ? localStorage.getItem(
                'ProjectDependencyGraphShowCompleteGraph',
              ) === 'true'
            : false;
      }
      this.createSearchedComponentLookupTable(to.params.componentUuids);
      this.computeData();
    },
  },
  methods: {
    initCytoscape(elements) {
      if (this.cy) {
        this.cy.destroy();
        this.cy = null;
      }
      this.$nextTick(() => {
        this.cy = cytoscape({
          container: this.$refs.cyContainer,
          elements: elements,
          style: [
            {
              selector: 'node',
              style: {
                label: 'data(label)',
                'text-valign': 'center',
                'text-halign': 'center',
                'background-color': '#fff',
                'border-width': 1,
                'border-color': '#20a8d8',
                color: '#333',
                'font-size': '10px',
                'text-wrap': 'none',
                shape: 'roundrectangle',
                width: 'label',
                height: 'label',
                padding: '5px',
                'text-max-width': '300px',
              },
            },
            {
              selector: 'node[objectType = "PROJECT"]',
              style: {
                'background-color': '#d0eaf4',
                'border-width': 3,
                'border-color': '#20a8d8',
                'font-weight': 'bold',
                'font-size': '12px',
              },
            },
            {
              selector: 'node.searched',
              style: {
                'background-color': '#d4edda',
                'border-width': 3,
                'border-color': '#4dbd74',
                'font-weight': 'bold',
              },
            },
            {
              selector: 'node.outdated',
              style: {
                'border-color': '#ffc107',
                'border-width': 2,
              },
            },
            {
              selector: 'node.path-highlight',
              style: {
                'background-color': '#e8f8ec',
                'border-width': 2,
              },
            },
            {
              selector: 'node.dimmed',
              style: {
                opacity: 0.3,
              },
            },
            {
              selector: 'node.expandable',
              style: {
                'border-style': 'dashed',
                'border-width': 2,
              },
            },
            // Badge node for expand indicator
            {
              selector: 'node.expand-badge',
              style: {
                shape: 'ellipse',
                width: '22px',
                height: '22px',
                'background-color': '#105770',
                color: '#fff',
                'font-size': '9px',
                'font-weight': 'bold',
                'text-valign': 'center',
                'text-halign': 'center',
                'border-width': 0,
                padding: '0',
                label: 'data(badgeLabel)',
              },
            },
            {
              selector: 'node.expand-badge:active',
              style: {
                'background-color': '#20a8d8',
              },
            },
            {
              selector: 'edge',
              style: {
                width: 1,
                'line-color': '#20a8d8',
                'target-arrow-color': '#20a8d8',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'arrow-scale': 0.8,
                opacity: 0.2,
              },
            },
            {
              selector: 'edge.shortest-path',
              style: {
                'line-color': '#4dbd74',
                'target-arrow-color': '#4dbd74',
                width: 3,
                opacity: 1,
                'z-index': 10,
              },
            },
            {
              selector: 'edge.path-highlight',
              style: {
                'line-color': '#4dbd74',
                'target-arrow-color': '#4dbd74',
                width: 2,
              },
            },
            {
              selector: 'edge.dimmed',
              style: {
                opacity: 0.08,
              },
            },
            // Hidden edge to badge (no arrow)
            {
              selector: 'edge.badge-edge',
              style: {
                'line-color': '#105770',
                'line-style': 'dashed',
                'target-arrow-shape': 'none',
                width: 1,
                opacity: 0.5,
              },
            },
          ],
          layout: { name: 'preset' },
          wheelSensitivity: 0.3,
          minZoom: 0.1,
          maxZoom: 3,
        });

        this.cy.on('tap', 'node', (evt) => {
          let node = evt.target;
          // Clicking a badge expands the parent component
          if (node.hasClass('expand-badge')) {
            let parentId = node.data('parentId');
            this.expandNode(parentId);
            return;
          }
          if (node.hasClass('expandable')) {
            this.expandNode(node.data('id'));
            return;
          }
          let objectType = node.data('objectType');
          let uuid = node.data('id');
          if (objectType === 'COMPONENT') {
            this.$router.push({ path: '/components/' + uuid });
          } else if (objectType === 'SERVICE') {
            this.$router.push({ path: '/services/' + uuid });
          }
        });

        this.runLayout();
        this.applyOutdatedHighlighting();

        // Center on project root at readable zoom
        let root = this.cy.getElementById(this.project.uuid);
        if (root.length > 0) {
          this.cy.zoom({ level: 1.5, position: root.position() });
          this.cy.center(root);
        }
      });
    },
    setLayout(layout) {
      this.activeLayout = layout;
      this.runLayout();
      this.fitToScreen();
    },
    fitToScreen() {
      if (!this.cy) return;
      this.cy.fit(undefined, 30);
    },
    centerOnRoot() {
      if (!this.cy) return;
      let root = this.cy.getElementById(this.project.uuid);
      if (root.length > 0) {
        this.cy.zoom({ level: 1.5, position: root.position() });
        this.cy.center(root);
      }
    },
    runLayout() {
      if (!this.cy || this.cy.nodes().length === 0) return;

      let layoutConfig;
      if (this.activeLayout === 'network') {
        layoutConfig = {
          name: 'cose',
          idealEdgeLength: 120,
          nodeOverlap: 30,
          nodeRepulsion: 8000,
          edgeElasticity: 100,
          gravity: 0.25,
          numIter: 1500,
          fit: false,
          padding: 30,
          animate: false,
          randomize: true,
        };
      } else {
        let rankDir = this.activeLayout.replace('dagre-', '');
        layoutConfig = {
          name: 'dagre',
          rankDir: rankDir,
          nodeSep: 20,
          rankSep: 50,
          edgeSep: 10,
          fit: false,
          padding: 30,
          animate: false,
        };
      }

      this.cy.layout(layoutConfig).run();
    },
    createNodeLabel(identity) {
      const isProject = !identity.objectType;
      if (!isProject && identity.purlCoordinates) {
        return identity.purlCoordinates;
      } else if (!isProject && identity.purl) {
        return identity.purl;
      } else {
        let label = '';
        if (identity.groupId) {
          label += identity.groupId + ' ';
        }
        if (identity.name) {
          label += identity.name;
        }
        if (identity.version) {
          label += ' ' + identity.version;
        }
        return label;
      }
    },
    computeData() {
      if (!this.project || !this.project.directDependencies) {
        this.$emit('total', 0);
        return;
      }

      this.$emit('total', 1);

      if (!this.$route.params.componentUuids) {
        this.renderFullGraph();
        return;
      }

      this.createSearchedComponentLookupTable(
        this.$route.params.componentUuids,
      );
      this.loading = true;

      let url = `${this.$api.BASE_URL}/${this.$api.URL_COMPONENT}/project/${
        this.project.uuid
      }/dependencyGraph/${encodeURIComponent(
        this.$route.params.componentUuids,
      )}`;

      this.axios.get(url).then((response) => {
        this.loading = false;
        if (response.data && Object.keys(response.data).length > 0) {
          this.notFound = false;
          this.graphResponse = response.data;
          this.renderSearchedGraph(response.data, !this.showCompleteGraph);
        } else {
          this.notFound = true;
          this.renderFullGraph();
        }
      });
    },
    renderFullGraph() {
      this.expandedComponents = new Set();
      let directDeps = JSON.parse(this.project.directDependencies);
      let elements = [];

      // Project root node
      elements.push({
        group: 'nodes',
        data: {
          id: this.project.uuid,
          label: this.createNodeLabel(this.project),
          objectType: 'PROJECT',
        },
      });

      // Direct dependency placeholder nodes (will be updated after API call)
      for (let dep of directDeps) {
        let label = dep.purlCoordinates || dep.purl || dep.uuid;
        elements.push({
          group: 'nodes',
          data: {
            id: dep.uuid,
            label: label,
            objectType: dep.objectType || 'COMPONENT',
          },
          classes: 'expandable',
        });
        elements.push({
          group: 'edges',
          data: {
            id: 'e-' + this.project.uuid + '-' + dep.uuid,
            source: this.project.uuid,
            target: dep.uuid,
          },
        });
      }

      this.initCytoscape(elements);

      // Fetch full component info for labels, versions, and child counts
      let url = `${this.$api.BASE_URL}/${this.$api.URL_DEPENDENCY_GRAPH}/project/${this.project.uuid}/directDependencies`;
      this.axios.get(url).then((response) => {
        if (!this.cy || !response.data) return;
        this.cy.batch(() => {
          for (let comp of response.data) {
            if (!comp) continue;
            let node = this.cy.getElementById(comp.uuid);
            if (node.length === 0) continue;
            node.data('label', this.createNodeLabel(comp));
            node.data('version', comp.version);
            node.data(
              'latestVersion',
              comp.latestVersion || comp.repositoryMeta?.latestVersion,
            );
            if (comp.directDependencies) {
              let children = JSON.parse(comp.directDependencies);
              if (children && children.length > 0) {
                node.addClass('expandable');
                node.data('childCount', children.length);
                node.data('childDeps', JSON.stringify(children));
                this.addExpandBadge(comp.uuid, children.length);
              } else {
                node.removeClass('expandable');
              }
            } else {
              node.removeClass('expandable');
            }
          }
        });
        this.applyOutdatedHighlighting();
        this.runLayout();

        // Re-center on root after layout
        let root = this.cy.getElementById(this.project.uuid);
        if (root.length > 0) {
          this.cy.zoom({ level: 1.5, position: root.position() });
          this.cy.center(root);
        }
      });
    },
    addExpandBadge(parentId, childCount) {
      let badgeId = 'badge-' + parentId;
      if (this.cy.getElementById(badgeId).length > 0) return;
      this.cy.add([
        {
          group: 'nodes',
          data: {
            id: badgeId,
            badgeLabel: '+' + childCount,
            parentId: parentId,
          },
          classes: 'expand-badge',
        },
        {
          group: 'edges',
          data: {
            id: 'be-' + parentId,
            source: parentId,
            target: badgeId,
          },
          classes: 'badge-edge',
        },
      ]);
    },
    removeExpandBadge(parentId) {
      let badgeId = 'badge-' + parentId;
      let badge = this.cy.getElementById(badgeId);
      let edge = this.cy.getElementById('be-' + parentId);
      if (badge.length > 0) badge.remove();
      if (edge.length > 0) edge.remove();
    },
    renderSearchedGraph(dependencies, onlySearched) {
      this.expandedComponents = new Set();
      let directDeps = JSON.parse(this.project.directDependencies);
      let projectId = this.project.uuid;
      let self = this;

      // Build forward adjacency: parent -> [children] (only within dependencies)
      let forwardAdj = {};
      // Project -> direct deps
      let directDepUuids = [];
      for (let dep of directDeps) {
        if (dependencies[dep.uuid]) {
          directDepUuids.push(dep.uuid);
        }
      }
      forwardAdj[projectId] = directDepUuids;
      for (let [uuid, comp] of Object.entries(dependencies)) {
        if (comp.dependencyGraph) {
          forwardAdj[uuid] = comp.dependencyGraph.filter(
            (d) => dependencies[d],
          );
        } else {
          forwardAdj[uuid] = [];
        }
      }

      // Build reverse adjacency: child -> [parents]
      let reverseAdj = {};
      for (let [parent, children] of Object.entries(forwardAdj)) {
        for (let child of children) {
          if (!reverseAdj[child]) reverseAdj[child] = [];
          reverseAdj[child].push(parent);
        }
      }

      // Find searched node UUIDs that exist in the data
      let searchedUuids = Object.keys(this.searchedComponentUuids).filter(
        (uuid) => dependencies[uuid],
      );

      // Determine included nodes
      let includedNodes = new Set();
      if (onlySearched) {
        // Reverse BFS from searched nodes: only true ancestors
        let queue = [...searchedUuids];
        for (let uuid of queue) {
          includedNodes.add(uuid);
        }
        while (queue.length > 0) {
          let uuid = queue.shift();
          let parents = reverseAdj[uuid] || [];
          for (let parent of parents) {
            if (!includedNodes.has(parent)) {
              includedNodes.add(parent);
              queue.push(parent);
            }
          }
        }
        // Always include project root
        includedNodes.add(projectId);
      } else {
        // Complete graph: include everything
        includedNodes.add(projectId);
        for (let uuid of Object.keys(dependencies)) {
          includedNodes.add(uuid);
        }
      }

      // Compute shortest path from root to each searched node (BFS)
      let shortestPathEdges = new Set();
      if (searchedUuids.length > 0) {
        let prev = {}; // uuid -> parent uuid on shortest path
        let visited = new Set();
        let queue = [projectId];
        visited.add(projectId);
        let found = new Set();

        while (queue.length > 0 && found.size < searchedUuids.length) {
          let uuid = queue.shift();
          if (self.searchedComponentUuids[uuid]) {
            found.add(uuid);
          }
          let children = forwardAdj[uuid] || [];
          for (let child of children) {
            if (!visited.has(child) && includedNodes.has(child)) {
              visited.add(child);
              prev[child] = uuid;
              queue.push(child);
            }
          }
        }

        // Trace back from each searched node to root
        for (let target of searchedUuids) {
          let cur = target;
          while (prev[cur] !== undefined) {
            shortestPathEdges.add('e-' + prev[cur] + '-' + cur);
            cur = prev[cur];
          }
        }
      }

      // Build elements
      let elements = [];
      let addedNodes = new Set();
      let addedEdges = new Set();

      // Project root
      elements.push({
        group: 'nodes',
        data: {
          id: projectId,
          label: this.createNodeLabel(this.project),
          objectType: 'PROJECT',
        },
      });
      addedNodes.add(projectId);

      // Add included component nodes
      for (let uuid of includedNodes) {
        if (addedNodes.has(uuid)) continue;
        let comp = dependencies[uuid];
        if (!comp) continue;
        let classes = [];
        if (self.searchedComponentUuids[uuid]) {
          classes.push('searched');
        }
        elements.push({
          group: 'nodes',
          data: {
            id: uuid,
            label: self.createNodeLabel(comp),
            objectType: comp.objectType || 'COMPONENT',
            version: comp.version,
            latestVersion:
              comp.latestVersion || comp.repositoryMeta?.latestVersion,
          },
          classes: classes.join(' '),
        });
        addedNodes.add(uuid);
      }

      // Add edges (only between included nodes)
      for (let [parent, children] of Object.entries(forwardAdj)) {
        if (!addedNodes.has(parent)) continue;
        for (let child of children) {
          if (!addedNodes.has(child)) continue;
          let edgeId = 'e-' + parent + '-' + child;
          if (addedEdges.has(edgeId)) continue;
          let classes = [];
          if (shortestPathEdges.has(edgeId)) {
            classes.push('shortest-path');
          }
          elements.push({
            group: 'edges',
            data: { id: edgeId, source: parent, target: child },
            classes: classes.join(' '),
          });
          addedEdges.add(edgeId);
        }
      }

      this.initCytoscape(elements);

      // In complete graph view, dim non-ancestor nodes
      if (!onlySearched && searchedUuids.length > 0) {
        this.$nextTick(() => {
          if (!this.cy) return;
          // Find all ancestors of searched nodes
          let ancestorIds = new Set(searchedUuids);
          let queue = [...searchedUuids];
          while (queue.length > 0) {
            let uuid = queue.shift();
            let parents = reverseAdj[uuid] || [];
            for (let parent of parents) {
              if (!ancestorIds.has(parent)) {
                ancestorIds.add(parent);
                queue.push(parent);
              }
            }
          }
          ancestorIds.add(projectId);
          this.cy.nodes().forEach((node) => {
            if (!ancestorIds.has(node.id()) && !node.hasClass('expand-badge')) {
              node.addClass('dimmed');
            }
          });
          this.cy.edges().forEach((edge) => {
            if (edge.hasClass('badge-edge')) return;
            let srcIn = ancestorIds.has(edge.source().id());
            let tgtIn = ancestorIds.has(edge.target().id());
            if (!srcIn || !tgtIn) {
              edge.addClass('dimmed');
            }
          });
        });
      }
    },
    async expandNode(uuid) {
      if (!this.cy) return;
      if (this.expandedComponents.has(uuid)) return;
      this.expandedComponents.add(uuid);

      let node = this.cy.getElementById(uuid);
      if (node.length > 0) {
        node.removeClass('expandable');
      }
      this.removeExpandBadge(uuid);

      let url = `${this.$api.BASE_URL}/${this.$api.URL_DEPENDENCY_GRAPH}/component/${uuid}/directDependencies`;
      let response = await this.axios.get(url);
      if (!response.data || !this.cy) return;

      this.cy.batch(() => {
        for (let comp of response.data) {
          if (!comp) continue;
          // Add node if new
          if (this.cy.getElementById(comp.uuid).length === 0) {
            let hasChildren = false;
            if (comp.directDependencies) {
              let gc = JSON.parse(comp.directDependencies);
              hasChildren = gc && gc.length > 0;
            }
            this.cy.add({
              group: 'nodes',
              data: {
                id: comp.uuid,
                label: this.createNodeLabel(comp),
                objectType: comp.objectType || 'COMPONENT',
                version: comp.version,
                latestVersion:
                  comp.latestVersion || comp.repositoryMeta?.latestVersion,
                childCount: hasChildren
                  ? JSON.parse(comp.directDependencies).length
                  : 0,
                childDeps: hasChildren ? comp.directDependencies : undefined,
              },
              classes: hasChildren ? 'expandable' : '',
            });
            if (hasChildren) {
              this.addExpandBadge(
                comp.uuid,
                JSON.parse(comp.directDependencies).length,
              );
            }
          }
          // Add edge if new
          let edgeId = 'e-' + uuid + '-' + comp.uuid;
          if (this.cy.getElementById(edgeId).length === 0) {
            this.cy.add({
              group: 'edges',
              data: { id: edgeId, source: uuid, target: comp.uuid },
            });
          }
        }
      });

      this.applyOutdatedHighlighting();
      this.runLayout();
    },
    applyOutdatedHighlighting() {
      if (!this.cy) return;
      this.cy.nodes('[objectType]').forEach((node) => {
        let baseLabel = node.data('baseLabel') || node.data('label');
        if (!node.data('baseLabel')) {
          node.data('baseLabel', baseLabel);
        }
        if (
          this.highlightOutdatedComponents &&
          node.data('version') &&
          node.data('latestVersion') &&
          node.data('latestVersion') !== node.data('version')
        ) {
          node.addClass('outdated');
          node.data(
            'label',
            baseLabel +
              ' \u26a0 ' +
              xssFilters.inHTMLData(node.data('latestVersion')),
          );
        } else {
          node.removeClass('outdated');
          node.data('label', baseLabel);
        }
      });
    },
    createSearchedComponentLookupTable(componentUuids) {
      this.searchedComponentUuids = {};
      if (componentUuids) {
        componentUuids.split('|').forEach((uuid) => {
          this.searchedComponentUuids[uuid] = true;
        });
      }
      return this.searchedComponentUuids;
    },
  },
};
</script>

<style scoped>
.graph-wrapper {
  position: relative;
  margin-top: 5px;
}
.cy-container {
  width: 100%;
  height: calc(100vh - 300px);
  min-height: 400px;
  border: 1px solid #e0e0e0;
}
.graph-controls {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  background: rgba(255, 255, 255, 0.85);
  padding: 4px 6px;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.graph-controls .btn {
  font-size: 0.75rem;
}
.control-group {
  display: flex;
  gap: 2px;
}
</style>
